import { Prisma } from '@agentmarket/database';
import { AppError } from '@agentmarket/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { signWalletToken } from '../services/wallet-token.js';

export interface MeteredRouteMeta {
  resource: string;
  priceUsd: number;
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

/**
 * The x402 gate. On every metered route:
 *
 *   1. No X-PAYMENT header  -> 402 with PaymentRequirements JSON (never throws).
 *   2. Header present       -> decode + verify via the active PaymentProvider.
 *   3. Already-seen paymentRef with a stored response -> replay it verbatim,
 *      no re-settlement, no re-execution (replay-attack / duplicate-payment safe).
 *   4. New, valid payment   -> enforce the daily per-wallet spend cap, then
 *      atomically claim the paymentRef (DB unique constraint) before
 *      settling, so two concurrent requests for the same payment can never
 *      both settle.
 *   5. On success, the wallet is marked verified (promotes its rate-limit
 *      tier) and `request.paymentContext` is populated for downstream use.
 */
export function createX402PreHandler(ctx: AppContext, meta: MeteredRouteMeta) {
  return async function x402PreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { body: requiredBody, requirement } = ctx.paymentService.buildPaymentRequired(meta.resource, meta.priceUsd);
    const header = headerValue(request.headers['x-payment']);

    const incoming = await ctx.paymentService.processIncomingPayment(header, requirement);

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
        metadata: { resource: meta.resource, reason: incoming.reason },
      });
      throw new AppError('PAYMENT_VERIFICATION_FAILED', incoming.reason ?? 'Payment could not be verified', 402);
    }

    const { paymentRef, payload, payerAddress } = incoming;
    const cacheKey = `payment:${paymentRef}`;

    // Replay of an already-settled payment: serve the stored response, do nothing else.
    const replay = await ctx.db.cachedResponses.findFresh(cacheKey);
    if (replay) {
      reply.header('x-payment-replay', 'true');
      reply.code(200).send(JSON.parse(replay.payload));
      return;
    }

    let walletId: string | undefined;
    if (payerAddress) {
      const wallet = await ctx.db.wallets.touch(payerAddress, requirement.network);
      walletId = wallet.id;

      const spendTodaySince = new Date();
      spendTodaySince.setUTCHours(0, 0, 0, 0);
      const spentAtomic = await ctx.db.payments.sumSettledSpendSince(walletId, spendTodaySince);
      const spentUsd = spentAtomic / 1_000_000;
      const thisPaymentUsd = Number(requirement.maxAmountRequired) / 1_000_000;
      if (spentUsd + thisPaymentUsd > ctx.config.rateLimits.dailySpendCapUsd) {
        throw new AppError('BUDGET_EXCEEDED', 'Daily spend cap exceeded for this wallet.', 402, {
          dailySpendCapUsd: ctx.config.rateLimits.dailySpendCapUsd,
        });
      }
    }

    // Atomically claim this paymentRef via the DB's unique constraint before settling,
    // so a duplicate/replayed X-PAYMENT arriving concurrently can never double-settle.
    try {
      await ctx.db.payments.create({
        paymentRef,
        resource: meta.resource,
        amountAtomic: requirement.maxAmountRequired,
        asset: requirement.asset,
        network: requirement.network,
        scheme: requirement.scheme,
        walletId,
        listingId: meta.listingId,
      });
    } catch (err) {
      const isUniqueConstraintViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isUniqueConstraintViolation) throw err;
      throw new AppError(
        'PAYMENT_ALREADY_SETTLED',
        'This payment reference is already being processed. Retry shortly.',
        409,
      );
    }

    const settleResult = await ctx.paymentService.settle(payload, requirement);
    if (!settleResult.success) {
      await ctx.db.payments.markFailed(paymentRef);
      await ctx.db.auditLogs.record({
        actorType: 'wallet',
        actorId: payerAddress,
        action: 'payment.failed',
        metadata: { resource: meta.resource, paymentRef, reason: settleResult.errorReason },
      });
      throw new AppError('PAYMENT_VERIFICATION_FAILED', settleResult.errorReason ?? 'Settlement failed', 402);
    }

    await ctx.db.auditLogs.record({
      actorType: 'wallet',
      actorId: payerAddress,
      action: 'payment.settled',
      metadata: { resource: meta.resource, paymentRef, transactionId: settleResult.transactionId },
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
      listingId: meta.listingId,
    };
  };
}

export { REPLAY_CACHE_TTL_SECONDS };
