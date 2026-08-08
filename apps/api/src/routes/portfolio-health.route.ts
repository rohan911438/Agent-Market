import {
  PortfolioHealthRequestSchema,
  PortfolioHealthResponseSchema,
  type PortfolioHealthRequest,
  type PortfolioHealthResponse,
} from '@agentmarket/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import type { MeteredHandlerResult } from './register-metered-route.js';
import { registerMeteredRoute } from './register-metered-route.js';

export async function portfolioHealthHandler(
  ctx: AppContext,
  { body: requestBody, request }: { body: PortfolioHealthRequest; request: FastifyRequest },
): Promise<MeteredHandlerResult<unknown>> {
  const start = Date.now();
  const providers = new Set<string>();

  const priced = await Promise.all(
    requestBody.holdings.map(async (holding) => {
      const result = await ctx.providerRegistry.fetchPrice(holding.symbol);
      if (result) providers.add(result.source);
      return { ...holding, priceUsd: result?.result.priceUsd ?? 0, valueUsd: (result?.result.priceUsd ?? 0) * holding.quantity };
    }),
  );

  const totalValueUsd = priced.reduce((sum, h) => sum + h.valueUsd, 0);
  const warnings: string[] = [];

  let diversificationScore = 100;
  if (totalValueUsd > 0) {
    const herfindahl = priced.reduce((sum, h) => sum + (h.valueUsd / totalValueUsd) ** 2, 0);
    diversificationScore = Math.round((1 - herfindahl) * 100);

    for (const holding of priced) {
      const share = holding.valueUsd / totalValueUsd;
      if (share >= 0.5) {
        warnings.push(`${holding.symbol} is ${Math.round(share * 100)}% of the portfolio — high concentration risk`);
      }
    }
  }
  if (priced.length === 1) warnings.push('Single-asset portfolio: zero diversification');

  const riskScore = Math.round(100 - diversificationScore * 0.8);

  const responseBody: PortfolioHealthResponse = {
    totalValueUsd,
    diversificationScore,
    riskScore,
    concentrationWarnings: warnings,
    recommendation:
      diversificationScore >= 60
        ? 'Portfolio is reasonably diversified.'
        : 'Consider reducing concentration in top holdings to lower risk.',
    meta: {
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      status: 'live',
      cacheHit: false,
      providers: Array.from(providers),
      latencyMs: Date.now() - start,
    },
  };

  PortfolioHealthResponseSchema.parse(responseBody);
  return { body: responseBody, cacheHit: false, providers: Array.from(providers) };
}

/**
 * Not cached — portfolio composition is per-request/per-caller, not a
 * shared market fact, so there is no meaningful cache key to reuse across
 * requests.
 */
export function registerPortfolioHealthRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'POST',
    url: '/v1/portfolio-health',
    resource: '/v1/portfolio-health',
    priceUsd: 0.04,
    bodySchema: PortfolioHealthRequestSchema,
    handler: (args) => portfolioHealthHandler(ctx, args),
  });
}
