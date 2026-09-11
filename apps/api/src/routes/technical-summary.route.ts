import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { SymbolSchema, TechnicalSummaryResponseSchema, TimeframeSchema, type TechnicalSummaryResponse } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { registerMeteredRoute } from './register-metered-route.js';

const QuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});

export function registerTechnicalSummaryRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/technical-summary',
    resource: '/v1/technical-summary',
    priceUsd: 0.03,
    querySchema: QuerySchema,
    handler: async ({ query, request }) => {
      const cacheKey = buildCacheKey('technical-summary', { symbol: query.symbol, timeframe: query.timeframe });

      const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('technicalSummary'), async () => {
        const start = Date.now();
        const { snapshot, signals } = await ctx.intelligenceEngine.computeSnapshotAndSignals(
          query.symbol,
          query.timeframe,
        );

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
    },
  });
}
