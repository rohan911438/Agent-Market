import { PortfolioHealthRequestSchema } from '@rohankumar4179/shared-types';
import type { FastifyRequest } from 'fastify';
import type { ZodObject, ZodRawShape } from 'zod';
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

export interface FirstPartyTaskHandler {
  resource: string;
  querySchema?: ZodObject<ZodRawShape>;
  bodySchema?: ZodObject<ZodRawShape>;
  run: (ctx: AppContext, args: { query: unknown; body: unknown; request: FastifyRequest }) => Promise<MeteredHandlerResult<unknown>>;
}

/**
 * Maps a metered resource path to the exact handler function the HTTP route
 * calls — the A2A task lifecycle (routes/a2a/tasks.route.ts) executes
 * `message/send` through this registry instead of re-implementing any of
 * the 8 endpoints' business logic a second time. Keyed by `resource` so it
 * composes directly with Phase 4's `buildCatalogTools()`, which already
 * carries `agentmarket.resource` per tool/skill.
 */
const REGISTRY: Record<string, FirstPartyTaskHandler> = {
  '/v1/analyze': {
    resource: '/v1/analyze',
    querySchema: AnalyzeQuerySchema,
    run: (ctx, { query, request }) => analyzeHandler(ctx, { query: query as never, request }),
  },
  '/v1/market-summary': {
    resource: '/v1/market-summary',
    querySchema: MarketSummaryQuerySchema,
    run: (ctx, { query, request }) => marketSummaryHandler(ctx, { query: query as never, request }),
  },
  '/v1/sentiment': {
    resource: '/v1/sentiment',
    querySchema: SentimentQuerySchema,
    run: (ctx, { query, request }) => sentimentHandler(ctx, { query: query as never, request }),
  },
  '/v1/risk-analysis': {
    resource: '/v1/risk-analysis',
    querySchema: RiskAnalysisQuerySchema,
    run: (ctx, { query, request }) => riskAnalysisHandler(ctx, { query: query as never, request }),
  },
  '/v1/technical-summary': {
    resource: '/v1/technical-summary',
    querySchema: TechnicalSummaryQuerySchema,
    run: (ctx, { query, request }) => technicalSummaryHandler(ctx, { query: query as never, request }),
  },
  '/v1/trending-assets': {
    resource: '/v1/trending-assets',
    querySchema: TrendingAssetsQuerySchema,
    run: (ctx, { query, request }) => trendingAssetsHandler(ctx, { query: query as never, request }),
  },
  '/v1/portfolio-health': {
    resource: '/v1/portfolio-health',
    bodySchema: PortfolioHealthRequestSchema,
    run: (ctx, { body, request }) => portfolioHealthHandler(ctx, { body: body as never, request }),
  },
  '/v1/execution-readiness': {
    resource: '/v1/execution-readiness',
    querySchema: ExecutionReadinessQuerySchema,
    run: (ctx, { query, request }) => executionReadinessHandler(ctx, { query: query as never, request }),
  },
};

export function findFirstPartyTaskHandler(resource: string): FirstPartyTaskHandler | undefined {
  return REGISTRY[resource];
}
