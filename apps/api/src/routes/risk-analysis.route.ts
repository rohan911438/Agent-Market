import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { RiskAnalysisResponseSchema, SymbolSchema, TimeframeSchema, type RiskAnalysisResponse } from '@agentmarket/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { MeteredHandlerResult } from './register-metered-route.js';
import { registerMeteredRoute } from './register-metered-route.js';

export const RiskAnalysisQuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});
export type RiskAnalysisQuery = z.infer<typeof RiskAnalysisQuerySchema>;

export async function riskAnalysisHandler(
  ctx: AppContext,
  { query, request }: { query: RiskAnalysisQuery; request: FastifyRequest },
): Promise<MeteredHandlerResult<unknown>> {
  const cacheKey = buildCacheKey('risk-analysis', { symbol: query.symbol, timeframe: query.timeframe });

  const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('riskAnalysis'), async () => {
    const start = Date.now();
    const { snapshot, signals } = await ctx.intelligenceEngine.computeSnapshotAndSignals(query.symbol, query.timeframe);
    const risk = ctx.intelligenceEngine.computeRisk(signals, snapshot.dataCompleteness);

    const body: RiskAnalysisResponse = {
      symbol: snapshot.symbol,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      volatility: signals.volatility,
      liquidityScore: signals.liquidity,
      drawdownRiskPct: risk.drawdownRiskPct,
      factors: risk.factors,
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
  RiskAnalysisResponseSchema.parse(body);
  return { body, cacheHit, providers: value.meta.providers };
}

export function registerRiskAnalysisRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/risk-analysis',
    resource: '/v1/risk-analysis',
    priceUsd: 0.03,
    querySchema: RiskAnalysisQuerySchema,
    handler: (args) => riskAnalysisHandler(ctx, args),
  });
}
