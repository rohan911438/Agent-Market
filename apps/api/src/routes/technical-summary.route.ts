import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { SymbolSchema, TechnicalSummaryResponseSchema, TimeframeSchema, type TechnicalSummaryResponse } from '@rohankumar4179/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { MeteredHandlerResult } from './register-metered-route.js';
import { registerMeteredRoute } from './register-metered-route.js';

export const TechnicalSummaryQuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});
export type TechnicalSummaryQuery = z.infer<typeof TechnicalSummaryQuerySchema>;

export async function technicalSummaryHandler(
  ctx: AppContext,
  { query, request }: { query: TechnicalSummaryQuery; request: FastifyRequest },
): Promise<MeteredHandlerResult<unknown>> {
  const cacheKey = buildCacheKey('technical-summary', { symbol: query.symbol, timeframe: query.timeframe });

  const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('technicalSummary'), async () => {
    const start = Date.now();
    const { snapshot, signals } = await ctx.intelligenceEngine.computeSnapshotAndSignals(query.symbol, query.timeframe);

    const support = snapshot.candles?.length ? Math.min(...snapshot.candles.map((c) => c.low)) : undefined;
    const resistance = snapshot.candles?.length ? Math.max(...snapshot.candles.map((c) => c.high)) : undefined;

    const body: TechnicalSummaryResponse = {
      symbol: snapshot.symbol,
      trend: signals.trendDirection,
      momentum: signals.momentum,
      support,
      resistance,
      summary: `Trend: ${signals.trendDirection} (strength ${signals.trendStrength}/100). Momentum score ${signals.momentum}.`,
      meta: {
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        status: snapshot.candles?.length ? 'live' : 'beta',
        cacheHit: false,
        providers: snapshot.sourcesUsed,
        latencyMs: Date.now() - start,
      },
    };
    return body;
  });

  const body = { ...value, meta: { ...value.meta, cacheHit } };
  TechnicalSummaryResponseSchema.parse(body);
  return { body, cacheHit, providers: value.meta.providers };
}

export function registerTechnicalSummaryRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/technical-summary',
    resource: '/v1/technical-summary',
    priceUsd: 0.03,
    querySchema: TechnicalSummaryQuerySchema,
    handler: (args) => technicalSummaryHandler(ctx, args),
  });
}
