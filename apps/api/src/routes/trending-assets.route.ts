import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { TrendingAssetsResponseSchema, type TrendingAssetsResponse } from '@rohankumar4179/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { MeteredHandlerResult } from './register-metered-route.js';
import { registerMeteredRoute } from './register-metered-route.js';

export const TrendingAssetsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type TrendingAssetsQuery = z.infer<typeof TrendingAssetsQuerySchema>;

export async function trendingAssetsHandler(
  ctx: AppContext,
  { query, request }: { query: TrendingAssetsQuery; request: FastifyRequest },
): Promise<MeteredHandlerResult<unknown>> {
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
}

export function registerTrendingAssetsRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/trending-assets',
    resource: '/v1/trending-assets',
    priceUsd: 0.02,
    querySchema: TrendingAssetsQuerySchema,
    handler: (args) => trendingAssetsHandler(ctx, args),
  });
}
