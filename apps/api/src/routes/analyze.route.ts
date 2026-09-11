import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { AnalyzeResponseSchema, SymbolSchema, TimeframeSchema } from '@rohankumar4179/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { MeteredHandlerResult } from './register-metered-route.js';
import { registerMeteredRoute } from './register-metered-route.js';

export const AnalyzeQuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});
export type AnalyzeQuery = z.infer<typeof AnalyzeQuerySchema>;

/**
 * The business logic behind `/v1/analyze`, independent of how it was
 * invoked — the HTTP route below and the A2A task lifecycle
 * (routes/a2a/tasks.route.ts) both call this exact function so there's only
 * ever one implementation of "what does analyze actually do".
 */
export async function analyzeHandler(
  ctx: AppContext,
  { query, request }: { query: AnalyzeQuery; request: FastifyRequest },
): Promise<MeteredHandlerResult<unknown>> {
  const cacheKey = buildCacheKey('analyze', { symbol: query.symbol, timeframe: query.timeframe });
  const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('analyze'), () =>
    ctx.intelligenceEngine.analyze({
      symbol: query.symbol,
      timeframe: query.timeframe,
      requestId: request.requestId,
    }),
  );

  const body = { ...value, meta: { ...value.meta, cacheHit } };
  AnalyzeResponseSchema.parse(body);
  return { body, cacheHit, providers: value.meta.providers };
}

/** Flagship endpoint: action, confidence, risk, and the reasoning behind them. */
export function registerAnalyzeRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/analyze',
    resource: '/v1/analyze',
    priceUsd: 0.05,
    querySchema: AnalyzeQuerySchema,
    handler: (args) => analyzeHandler(ctx, args),
  });
}
