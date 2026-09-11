import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { MarketSummaryResponseSchema, SymbolSchema, TimeframeSchema, type MarketSummaryResponse } from '@rohankumar4179/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { MeteredHandlerResult } from './register-metered-route.js';
import { registerMeteredRoute } from './register-metered-route.js';

export const MarketSummaryQuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});
export type MarketSummaryQuery = z.infer<typeof MarketSummaryQuerySchema>;

export async function marketSummaryHandler(
  ctx: AppContext,
  { query, request }: { query: MarketSummaryQuery; request: FastifyRequest },
): Promise<MeteredHandlerResult<unknown>> {
  const cacheKey = buildCacheKey('market-summary', { symbol: query.symbol, timeframe: query.timeframe });

  const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('marketSummary'), async () => {
    const start = Date.now();
    const { snapshot, signals } = await ctx.intelligenceEngine.computeSnapshotAndSignals(query.symbol, query.timeframe);

    const body: MarketSummaryResponse = {
      symbol: snapshot.symbol,
      priceUsd: snapshot.priceUsd ?? 0,
      change24hPct: snapshot.change24hPct ?? 0,
      volume24hUsd: snapshot.volume24hUsd ?? 0,
      marketCapUsd: snapshot.marketCapUsd,
      liquidityScore: signals.liquidity,
      volatility: signals.volatility,
      summary: `${snapshot.symbol} liquidity ${signals.liquidity}/100, volatility ${signals.volatility}/100.`,
      meta: {
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        status: 'live',
        cacheHit: false,
        providers: snapshot.sourcesUsed,
        latencyMs: Date.now() - start,
      },
    };
    return body;
  });

  const body = { ...value, meta: { ...value.meta, cacheHit } };
  MarketSummaryResponseSchema.parse(body);
  return { body, cacheHit, providers: value.meta.providers };
}

export function registerMarketSummaryRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/market-summary',
    resource: '/v1/market-summary',
    priceUsd: 0.02,
    querySchema: MarketSummaryQuerySchema,
    handler: (args) => marketSummaryHandler(ctx, args),
  });
}
