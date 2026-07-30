import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { TrendingAssetsResponseSchema, type TrendingAssetsResponse } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { registerMeteredRoute } from './register-metered-route.js';

const QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export function registerTrendingAssetsRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/trending-assets',
    resource: '/v1/trending-assets',
    priceUsd: 0.02,
    querySchema: QuerySchema,
    handler: async ({ query, request }) => {
      const cacheKey = buildCacheKey('trending-assets', { limit: query.limit });

      const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('trending'), async () => {
        const start = Date.now();
        const result = await ctx.providerRegistry.fetchTrending(query.limit);

        const body: TrendingAssetsResponse = {
          assets: (result?.result ?? []).map((asset) => ({
            symbol: asset.symbol,
            rank: asset.rank,
            priceUsd: asset.priceUsd ?? 0,
            change24hPct: asset.change24hPct ?? 0,
            trendScore: Math.max(0, 100 - (asset.rank - 1) * 10),
          })),
          meta: {
            requestId: request.requestId,
            timestamp: new Date().toISOString(),
            status: result ? 'live' : 'beta',
            cacheHit: false,
            providers: result ? [result.source] : [],
            latencyMs: Date.now() - start,
          },
        };
        return body;
      });

      const body = { ...value, meta: { ...value.meta, cacheHit } };
      TrendingAssetsResponseSchema.parse(body);
      return { body, cacheHit, providers: value.meta.providers };
    },
  });
}
