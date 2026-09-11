import { Prisma } from '@agentmarket/database';
import type { RouteDiscovery } from '@agentmarket/payments';
import { AppError } from '@rohankumar4179/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { originOf } from '../routes/catalog/origin.js';
import { signWalletToken } from '../services/wallet-token.js';

export interface MeteredRouteMeta {
  resource: string;
  priceUsd: number;
  /**
   * Optional per-route Bazaar discovery enrichment — example query params /
   * request body / response, used only to describe the endpoint in the
   * discovery catalog. Omitted by routes that haven't opted in.
   */
  discovery?: RouteDiscovery;
  /**
   * Set by a caller proxying a published third-party listing (the gateway,
   * Phase 12+) so the resulting Payment/ApiRequest rows attribute revenue to
   * that listing. Every first-party route today omits this, so it's null on
   * every payment/request row currently written — see Phase 07's scope note
   * on not fabricating revenue ahead of real traffic.
   */
  listingId?: string;
}

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

const REPLAY_CACHE_TTL_SECONDS = 24 * 60 * 60;
const ALGO_PRICE_CACHE_TTL_SECONDS = 60;
const ALGO_PRICE_CACHE_KEY = 'x402:algo-usd-price';

/**
 * Live ALGO/USD price for offering a native-ALGO PaymentRequirement
 * alongside the provider's primary (stablecoin) one — cached for a minute
 * so every metered call (each of which calls this twice: the initial 402
 * and the paid retry) doesn't hammer the price provider. Returns undefined
 * (never throws) on any failure, so a flaky price feed only means the ALGO
 * option is temporarily omitted from accepts[] — never a broken route.
 */
async function fetchAlgoUsdPrice(ctx: AppContext): Promise<number | undefined> {
  try {
    const { value } = await ctx.cache.getOrSet(ALGO_PRICE_CACHE_KEY, ALGO_PRICE_CACHE_TTL_SECONDS, async () => {
      const result = await ctx.providerRegistry.fetchPrice('ALGO');
      return result?.result.priceUsd ?? null;
    });
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The x402 gate. On every metered route:
 *
 *   1. No X-PAYMENT header  -> 402 with PaymentRequirements JSON (never throws).
 *   2. Header present       -> decode + verify via the active PaymentProvider.
 *   3. Already-seen paymentRef with a stored response -> replay it verbatim,
 *      no re-settlement, no re-execution (replay-attack / duplicate-payment safe).
 *   4. New, valid payment   -> atomically reserve the daily per-wallet spend
 *      cap (a single conditional UPDATE, not read-then-compare, so two
 *      concurrent payments for the same wallet can't both pass a stale
 *      check and jointly exceed the cap — see WalletRepository.reserveDailySpend),
 *      then atomically claim the paymentRef (DB unique constraint) before
 *      settling, so two concurrent requests for the same payment can never
 *      both settle. The reservation is released if the claim or settlement
 *      then fails, so a failed/duplicate payment never permanently eats into
 *      the cap.
 *   5. On success, the wallet is marked verified (promotes its rate-limit
 *      tier) and `request.paymentContext` is populated for downstream use.
 *
 * `meta` is normally a fixed object (every metered route today has a static
 * price known at registration time). It can also be an async resolver run
 * once per request — the one caller that needs this is the workflow engine
 * (routes/workflows.route.ts, Phase 12), whose total price depends on which
 * steps were requested and isn't known until the request body is parsed.
 * The resolver runs unconditionally, before the payment-header check, so a
 * resolver that validates its input (e.g. rejects an invalid pipeline) and
 * throws does so *before* any payment is taken — same "fail free" ordering
 * register-metered-route.ts's preValidation already guarantees for query/body
 * schemas. This is purely about *how* `{resource, priceUsd}` is obtained —
 * every verify/settle/replay/audit step below is completely unchanged.
 */
export function createX402PreHandler(
  ctx: AppContext,
  meta: MeteredRouteMeta | ((request: FastifyRequest) => Promise<MeteredRouteMeta>),
) {
  return async function x402PreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const resolvedMeta = typeof meta === 'function' ? await meta(request) : meta;
    const algoUsdPrice = ctx.config.payments.enableNativeAlgo ? await fetchAlgoUsdPrice(ctx) : undefined;
    const { body: requiredBody, requirements } = ctx.paymentService.buildPaymentRequired(
      resolvedMeta.resource,
      resolvedMeta.priceUsd,
      algoUsdPrice,
      { method: request.method, discovery: resolvedMeta.discovery, origin: originOf(request) },
    );
    const header = headerValue(request.headers['x-payment']);

    const incoming = await ctx.paymentService.processIncomingPayment(header, requirements);

    if (incoming.kind === 'missing') {
      request.errorCode = 'PAYMENT_REQUIRED';
      reply.code(402).send(requiredBody);
      return;
    }
    if (incoming.kind === 'malformed') {
      throw new AppError('PAYMENT_INVALID', incoming.reason, 400);
    }
    if (incoming.kind === 'invalid') {
      await ctx.db.auditLogs.record({
        actorType: 'wallet',
        action: 'payment.verification_failed',
        metadata: { resource: resolvedMeta.resource, reason: incoming.reason },
      });
      throw new AppError('PAYMENT_VERIFICATION_FAILED', incoming.reason ?? 'Payment could not be verified', 402);
    }

    const { paymentRef, payload, payerAddress, requirement } = incoming;
    const cacheKey = `payment:${paymentRef}`;

    // Replay of an already-settled payment: serve the stored response, do nothing else.
    const replay = await ctx.db.cachedResponses.findFresh(cacheKey);
    if (replay) {
      reply.header('x-payment-replay', 'true');
      reply.code(200).send(JSON.parse(replay.payload));
      return;
    }

    let walletId: string | undefined;
    let reservedAtomic: bigint | undefined;
    // Hoisted out of the `if` below so the failure paths further down can
    // hand releaseDailySpend the same UTC-day boundary.
    const now = new Date();
    const startOfTodayUtc = new Date(now);
    startOfTodayUtc.setUTCHours(0, 0, 0, 0);
    if (payerAddress) {
      const wallet = await ctx.db.wallets.touch(payerAddress, requirement.network);
      walletId = wallet.id;

      // The daily spend cap is denominated in USD. Reserve against it in
      // micro-USD derived from the route's USD price — NOT
      // `requirement.maxAmountRequired`, which is micro-ALGO when the caller
      // paid via the native-ALGO requirement and would otherwise be compared
      // directly against a micro-USD cap (undercounting when ALGO > $1).
      const amountAtomic = BigInt(Math.round(resolvedMeta.priceUsd * 1_000_000));
      const capAtomic = BigInt(Math.round(ctx.config.rateLimits.dailySpendCapUsd * 1_000_000));

      const reserved = await ctx.db.wallets.reserveDailySpend(walletId, amountAtomic, capAtomic, startOfTodayUtc, now);
      if (!reserved) {
        throw new AppError('BUDGET_EXCEEDED', 'Daily spend cap exceeded for this wallet.', 402, {
          dailySpendCapUsd: ctx.config.rateLimits.dailySpendCapUsd,
        });
      }
      reservedAtomic = amountAtomic;
    }

    // Atomically claim this paymentRef via the DB's unique constraint before settling,
    // so a duplicate/replayed X-PAYMENT arriving concurrently can never double-settle.
    try {
      await ctx.db.payments.create({
        paymentRef,
        resource: resolvedMeta.resource,
        amountAtomic: requirement.maxAmountRequired,
        asset: requirement.asset,
        network: requirement.network,
        scheme: requirement.scheme,
        walletId,
        listingId: resolvedMeta.listingId,
      });
    } catch (err) {
      if (walletId && reservedAtomic !== undefined)
        await ctx.db.wallets.releaseDailySpend(walletId, reservedAtomic, startOfTodayUtc);
      const isUniqueConstraintViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isUniqueConstraintViolation) throw err;
      throw new AppError(
        'PAYMENT_ALREADY_SETTLED',
        'This payment reference is already being processed. Retry shortly.',
        409,
      );
    }

    // A thrown error (e.g. the facilitator call timing out — see
    // FACILITATOR_TIMEOUT_MS in algorand-x402-provider.ts) is treated exactly
    // like a returned `{ success: false }`: either way the spend-cap
    // reservation must be released and the payment marked failed, or a
    // facilitator outage would silently strand reservations against wallets'
    // daily caps forever.
    let settleResult: Awaited<ReturnType<typeof ctx.paymentService.settle>>;
    try {
      settleResult = await ctx.paymentService.settle(payload, requirement);
    } catch (err) {
      settleResult = {
        success: false,
        network: requirement.network,
        errorReason: err instanceof Error ? err.message : 'Settlement request failed',
      };
    }
    if (!settleResult.success) {
      if (walletId && reservedAtomic !== undefined)
        await ctx.db.wallets.releaseDailySpend(walletId, reservedAtomic, startOfTodayUtc);
      await ctx.db.payments.markFailed(paymentRef);
      await ctx.db.auditLogs.record({
        actorType: 'wallet',
        actorId: payerAddress,
        action: 'payment.failed',
        metadata: { resource: resolvedMeta.resource, paymentRef, reason: settleResult.errorReason },
      });
      throw new AppError('PAYMENT_VERIFICATION_FAILED', settleResult.errorReason ?? 'Settlement failed', 402);
    }

    await ctx.db.auditLogs.record({
      actorType: 'wallet',
      actorId: payerAddress,
      action: 'payment.settled',
      metadata: { resource: resolvedMeta.resource, paymentRef, transactionId: settleResult.transactionId },
    });

    if (walletId && payerAddress) {
      await ctx.db.wallets.markVerified(payerAddress);
      reply.header('x-wallet-token', signWalletToken(payerAddress, ctx.config.security.walletTokenSecret));
    }

    request.paymentContext = {
      paymentRef,
      payerAddress,
      payload,
      requirement,
      transactionId: settleResult.transactionId,
      walletId,
      listingId: resolvedMeta.listingId,
    };
  };
}

export { REPLAY_CACHE_TTL_SECONDS };
