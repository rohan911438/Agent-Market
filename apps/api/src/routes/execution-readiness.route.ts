import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { ExecutionReadinessResponseSchema, SymbolSchema, TimeframeSchema, type ExecutionReadinessResponse } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { registerMeteredRoute } from './register-metered-route.js';

const QuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});

function resolveReadiness(liquidity: number, volatility: number): ExecutionReadinessResponse['readiness'] {
  if (liquidity >= 60 && volatility <= 50) return 'READY';
  if (liquidity >= 35) return 'CAUTION';
  return 'NOT_READY';
}

export function registerExecutionReadinessRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/execution-readiness',
    resource: '/v1/execution-readiness',
    priceUsd: 0.03,
    querySchema: QuerySchema,
    handler: async ({ query, request }) => {
      const cacheKey = buildCacheKey('execution-readiness', { symbol: query.symbol, timeframe: query.timeframe });

      const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('executionReadiness'), async () => {
        const start = Date.now();
        const { snapshot, signals } = await ctx.intelligenceEngine.computeSnapshotAndSignals(
          query.symbol,
          query.timeframe,
        );

        const readiness = resolveReadiness(signals.liquidity, signals.volatility);
        const estimatedSlippagePct = Math.max(0, Math.round(((100 - signals.liquidity) / 10) * 10) / 10);

        const body: ExecutionReadinessResponse = {
          symbol: snapshot.symbol,
          readiness,
          liquidityScore: signals.liquidity,
          volatility: signals.volatility,
          estimatedSlippagePct,
          summary: `${readiness} — liquidity ${signals.liquidity}/100, volatility ${signals.volatility}/100, est. slippage ${estimatedSlippagePct}%.`,
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
      ExecutionReadinessResponseSchema.parse(body);
      return { body, cacheHit, providers: value.meta.providers };
    },
  });
}
