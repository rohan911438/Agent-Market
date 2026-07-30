import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import type { AppContext } from '../context.js';
import { createRateLimitPreHandler } from '../middleware/rate-limit.js';
import { createX402PreHandler, REPLAY_CACHE_TTL_SECONDS } from '../middleware/x402-payment.js';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  querySchema?: ZodType<TQuery, any, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bodySchema?: ZodType<TBody, any, any>;
  handler: (args: { query: TQuery; body: TBody; request: FastifyRequest }) => Promise<MeteredHandlerResult<TResult>>;
}

/**
 * Wires a full metered route: validate -> rate limit -> x402 payment gate ->
 * handler -> response caching (for idempotent replay) -> observability
 * logging. Every intelligence endpoint is registered through this one
 * function so the cross-cutting concerns (payment, rate limiting, audit)
 * are implemented exactly once instead of duplicated per route.
 *
 * Validation runs in `preValidation`, *before* the payment gate — an
 * invalid request must fail for free. Validating inside the handler would
 * mean the payment gate (and its settlement) runs first, charging the
 * caller for a request that was never going to succeed.
 */
export function registerMeteredRoute<TQuery = undefined, TBody = undefined, TResult = unknown>(
  options: RegisterMeteredRouteOptions<TQuery, TBody, TResult>,
): void {
  const { server, ctx, method, url, resource, priceUsd, querySchema, bodySchema, handler } = options;

  server.route({
    method,
    url,
    preValidation: async (request: FastifyRequest) => {
      request.validated = {
        query: querySchema ? querySchema.parse(request.query) : undefined,
        body: bodySchema ? bodySchema.parse(request.body) : undefined,
      };
    },
    preHandler: [createRateLimitPreHandler(ctx), createX402PreHandler(ctx, { resource, priceUsd })],
    handler: async (request, reply) => {
      const query = request.validated?.query as TQuery;
      const body = request.validated?.body as TBody;

      const result = await handler({ query, body, request });
      request.resultMeta = { cacheHit: result.cacheHit, providers: result.providers };

      // Returning `reply` (rather than calling reply.send() and letting the
      // async function separately resolve to undefined) avoids Fastify
      // treating the handler's own promise resolution as a second,
      // phantom send — which otherwise races the real one through onSend.
      return reply.code(200).send(result.body);
    },
    onSend: [
      async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
        const paymentContext = request.paymentContext;
        if (!paymentContext || reply.statusCode !== 200) return payload;

        const payloadStr = typeof payload === 'string' ? payload : String(payload);
        const expiresAt = new Date(Date.now() + REPLAY_CACHE_TTL_SECONDS * 1000);
        const cached = await ctx.db.cachedResponses.upsert(`payment:${paymentContext.paymentRef}`, resource, payloadStr, expiresAt);
        await ctx.db.payments.markSettled(paymentContext.paymentRef, paymentContext.transactionId ?? 'unknown', cached.id);

        return payload;
      },
    ],
    onResponse: [
      async (request: FastifyRequest, reply: FastifyReply) => {
        const latencyMs = Math.max(0, Math.round(reply.elapsedTime ?? Date.now() - request.startTimeMs));

        await ctx.db.apiRequests.create({
          requestId: request.requestId,
          route: resource,
          method,
          ipAddress: request.ip,
          walletId: request.paymentContext?.walletId,
          providerUsed: request.resultMeta?.providers.join(',') || undefined,
          cacheHit: request.resultMeta?.cacheHit ?? false,
          statusCode: reply.statusCode,
          latencyMs,
          errorCode: reply.statusCode >= 400 ? request.errorCode : undefined,
        });

        if (reply.statusCode === 200 && request.paymentContext?.walletId) {
          await ctx.db.usage.record(resource, priceUsd, request.paymentContext.walletId);
        }
      },
    ],
  });
}
