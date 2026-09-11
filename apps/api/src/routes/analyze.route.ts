import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { AnalyzeResponseSchema, SymbolSchema, TimeframeSchema } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { registerMeteredRoute } from './register-metered-route.js';

const QuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});

/** Flagship endpoint: action, confidence, risk, and the reasoning behind them. */
export function registerAnalyzeRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/analyze',
    resource: '/v1/analyze',
    priceUsd: 0.05,
    querySchema: QuerySchema,
    handler: async ({ query, request }) => {
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
    },
  });
}
