import type { RouteDiscovery } from '@agentmarket/payments';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import type { AppContext } from '../context.js';
import { createX402PreHandler, REPLAY_CACHE_TTL_SECONDS } from '../middleware/x402-payment.js';
import { tracedHandler, tracedPreHandler } from '../observability/tracing.js';

export interface MeteredHandlerResult<TResult> {
  body: TResult;
  cacheHit: boolean;
  providers: string[];
}

export interface RegisterMeteredRouteOptions<TQuery, TBody, TResult> {
  server: FastifyInstance;
  ctx: AppContext;
  method: 'GET' | 'POST';
  url: string;
  /** Marketplace/audit identifier, e.g. "/v1/analyze". */
  resource: string;
  priceUsd: number;
  /** See MeteredRouteMeta.listingId — omitted by every first-party route today. */
  listingId?: string;
  /** Optional Bazaar discovery enrichment (example params / body / response) for this route's catalog entry. */
  discovery?: RouteDiscovery;
  /**
   * Overrides `resource`/`priceUsd`/`listingId` per-request instead of using
   * the static values above — for a route whose price depends on a path
   * param not known until the request arrives (e.g. a per-listing invoke
   * route priced at that listing's own `priceUsd`). Runs once, before the
   * payment gate, exactly like `createX402PreHandler`'s own resolver-form
   * `meta` (see its docstring) — this just plumbs that same capability
   * through to the caching/audit bookkeeping below, which otherwise only
   * ever sees the static `resource`/`priceUsd`/`listingId` closed over above.
   */
  resolveMeta?: (request: FastifyRequest) => Promise<{ resource: string; priceUsd: number; listingId?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  querySchema?: ZodType<TQuery, any, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bodySchema?: ZodType<TBody, any, any>;
  handler: (args: { query: TQuery; body: TBody; request: FastifyRequest }) => Promise<MeteredHandlerResult<TResult>>;
}

/**
 * Wires a full metered route: validate -> x402 payment gate -> handler ->
 * response caching (for idempotent replay) -> observability logging. Rate
 * limiting is applied once, globally, in server.ts — not per-route here.
 * Every intelligence endpoint is registered through this one function so the
 * cross-cutting concerns (payment, audit) are implemented exactly once
 * instead of duplicated per route.
 *
 * Validation runs in `preValidation`, *before* the payment gate — an
 * invalid request must fail for free. Validating inside the handler would
 * mean the payment gate (and its settlement) runs first, charging the
 * caller for a request that was never going to succeed.
 */
export function registerMeteredRoute<TQuery = undefined, TBody = undefined, TResult = unknown>(
  options: RegisterMeteredRouteOptions<TQuery, TBody, TResult>,
): void {
  const { server, ctx, method, url, resource, priceUsd, listingId, discovery, resolveMeta, querySchema, bodySchema, handler } =
    options;

  const paymentGateMeta = resolveMeta
    ? async (request: FastifyRequest) => {
        const resolved = await resolveMeta(request);
        request.resolvedMeteredMeta = resolved;
        return resolved;
      }
    : { resource, priceUsd, listingId, discovery };

  server.route({
    method,
    url,
    preValidation: async (request: FastifyRequest) => {
      request.validated = {
        query: querySchema ? querySchema.parse(request.query) : undefined,
        body: bodySchema ? bodySchema.parse(request.body) : undefined,
      };
    },
    preHandler: [tracedPreHandler('payment.gate', createX402PreHandler(ctx, paymentGateMeta))],
    handler: tracedHandler('handler', async (request, reply) => {
      const query = request.validated?.query as TQuery;
      const body = request.validated?.body as TBody;

      const result = await handler({ query, body, request });
      request.resultMeta = { cacheHit: result.cacheHit, providers: result.providers };

      // Returning `reply` (rather than calling reply.send() and letting the
      // async function separately resolve to undefined) avoids Fastify
      // treating the handler's own promise resolution as a second,
      // phantom send — which otherwise races the real one through onSend.
      return reply.code(200).send(result.body);
    }),
    onSend: [
      async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
        const paymentContext = request.paymentContext;
        if (!paymentContext || reply.statusCode !== 200) return payload;

        const effectiveResource = request.resolvedMeteredMeta?.resource ?? resource;
        const payloadStr = typeof payload === 'string' ? payload : String(payload);
        const expiresAt = new Date(Date.now() + REPLAY_CACHE_TTL_SECONDS * 1000);
        const cached = await ctx.db.cachedResponses.upsert(`payment:${paymentContext.paymentRef}`, effectiveResource, payloadStr, expiresAt);
        await ctx.db.payments.markSettled(paymentContext.paymentRef, paymentContext.transactionId ?? 'unknown', cached.id);

        return payload;
      },
    ],
    onResponse: [
      async (request: FastifyRequest, reply: FastifyReply) => {
        const latencyMs = Math.max(0, Math.round(reply.elapsedTime ?? Date.now() - request.startTimeMs));
        const effectiveResource = request.resolvedMeteredMeta?.resource ?? resource;
        const effectivePriceUsd = request.resolvedMeteredMeta?.priceUsd ?? priceUsd;
        const effectiveListingId = request.resolvedMeteredMeta?.listingId ?? listingId;

        await ctx.db.apiRequests.create({
          requestId: request.requestId,
          route: effectiveResource,
          method,
          ipAddress: request.ip,
          walletId: request.paymentContext?.walletId,
          providerUsed: request.resultMeta?.providers.join(',') || undefined,
          cacheHit: request.resultMeta?.cacheHit ?? false,
          statusCode: reply.statusCode,
          latencyMs,
          errorCode: reply.statusCode >= 400 ? request.errorCode : undefined,
          listingId: effectiveListingId,
        });

        if (reply.statusCode === 200 && request.paymentContext?.walletId) {
          await ctx.db.usage.record(effectiveResource, effectivePriceUsd, request.paymentContext.walletId);
        }
      },
    ],
  });
}
