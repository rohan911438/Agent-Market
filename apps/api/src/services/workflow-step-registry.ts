import { PortfolioHealthRequestSchema } from '@agentmarket/shared-types';
import type { FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import type { AppContext } from '../context.js';
import { analyzeHandler, AnalyzeQuerySchema } from '../routes/analyze.route.js';
import { executionReadinessHandler, ExecutionReadinessQuerySchema } from '../routes/execution-readiness.route.js';
import { marketSummaryHandler, MarketSummaryQuerySchema } from '../routes/market-summary.route.js';
import { portfolioHealthHandler } from '../routes/portfolio-health.route.js';
import type { MeteredHandlerResult } from '../routes/register-metered-route.js';
import { riskAnalysisHandler, RiskAnalysisQuerySchema } from '../routes/risk-analysis.route.js';
import { sentimentHandler, SentimentQuerySchema } from '../routes/sentiment.route.js';
import { technicalSummaryHandler, TechnicalSummaryQuerySchema } from '../routes/technical-summary.route.js';
import { trendingAssetsHandler, TrendingAssetsQuerySchema } from '../routes/trending-assets.route.js';

export interface WorkflowStepDefinition {
  /** GET steps take query params; POST steps (only portfolio-health today) take a body. Same distinction register-metered-route.ts already makes per route. */
  method: 'GET' | 'POST';
  /** Validates the *resolved* params (after template substitution) — the same schema the real HTTP route uses, so a step never runs with input its own route would have rejected. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: ZodType<any, any, any>;
  /**
   * Always-valid, fixed params used only to price this step (a 402 probe —
   * see workflow-executor.ts#probeWorkflowTotalPrice). Every registered
   * step's price is a flat constant independent of its params, so any
   * valid input works here; the caller's real (possibly
   * template-containing) params are never used for pricing.
   */
  dummyParamsForPricing: Record<string, unknown>;
  run: (ctx: AppContext, resolvedParams: unknown, request: FastifyRequest) => Promise<MeteredHandlerResult<unknown>>;
}

/**
 * The allowlist of first-party resources the orchestration engine (Phase
 * 12) may run as a pipeline step — reusing each route's own exported
 * handler function and query/body schema (services/catalog.ts's "shared
 * building blocks" precedent), never a second copy of the intelligence
 * logic. Third-party listings' `upstreamUrl` are deliberately excluded —
 * that depends on the not-yet-built gateway (see the phase's "Not in
 * scope").
 */
export const WORKFLOW_STEP_REGISTRY: Record<string, WorkflowStepDefinition> = {
  '/v1/sentiment': {
    method: 'GET',
    schema: SentimentQuerySchema,
    dummyParamsForPricing: { symbol: 'BTC' },
    run: (ctx, query, request) => sentimentHandler(ctx, { query: query as never, request }),
  },
  '/v1/risk-analysis': {
    method: 'GET',
    schema: RiskAnalysisQuerySchema,
    dummyParamsForPricing: { symbol: 'BTC' },
    run: (ctx, query, request) => riskAnalysisHandler(ctx, { query: query as never, request }),
  },
  '/v1/analyze': {
    method: 'GET',
    schema: AnalyzeQuerySchema,
    dummyParamsForPricing: { symbol: 'BTC' },
    run: (ctx, query, request) => analyzeHandler(ctx, { query: query as never, request }),
  },
  '/v1/market-summary': {
    method: 'GET',
    schema: MarketSummaryQuerySchema,
    dummyParamsForPricing: { symbol: 'BTC' },
    run: (ctx, query, request) => marketSummaryHandler(ctx, { query: query as never, request }),
  },
  '/v1/technical-summary': {
    method: 'GET',
    schema: TechnicalSummaryQuerySchema,
    dummyParamsForPricing: { symbol: 'BTC' },
    run: (ctx, query, request) => technicalSummaryHandler(ctx, { query: query as never, request }),
  },
  '/v1/trending-assets': {
    method: 'GET',
    schema: TrendingAssetsQuerySchema,
    dummyParamsForPricing: {},
    run: (ctx, query, request) => trendingAssetsHandler(ctx, { query: query as never, request }),
  },
  '/v1/execution-readiness': {
    method: 'GET',
    schema: ExecutionReadinessQuerySchema,
    dummyParamsForPricing: { symbol: 'BTC' },
    run: (ctx, query, request) => executionReadinessHandler(ctx, { query: query as never, request }),
  },
  '/v1/portfolio-health': {
    method: 'POST',
    schema: PortfolioHealthRequestSchema,
    dummyParamsForPricing: { holdings: [{ symbol: 'BTC', quantity: 1 }] },
    run: (ctx, body, request) => portfolioHealthHandler(ctx, { body: body as never, request }),
  },
};

export function isKnownWorkflowStepResource(resource: string): boolean {
  return resource in WORKFLOW_STEP_REGISTRY;
}
