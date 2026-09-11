import { OpenApiGeneratorV3, OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import {
  AnalyzeResponseSchema,
  ExecutionReadinessResponseSchema,
  MarketSummaryResponseSchema,
  PortfolioHealthRequestSchema,
  PortfolioHealthResponseSchema,
  RiskAnalysisResponseSchema,
  SentimentResponseSchema,
  SymbolSchema,
  TechnicalSummaryResponseSchema,
  TimeframeSchema,
  TrendingAssetsResponseSchema,
} from '@agentmarket/shared-types';
import type { OpenAPIObject } from 'openapi3-ts/oas30';
import { z, type ZodObject, type ZodRawShape, type ZodType } from 'zod';

// zod-to-openapi patches ZodType's prototype with `.openapi()` — a one-time,
// process-wide side effect. Safe to call more than once; guarded anyway so
// re-imports in tests don't warn.
extendZodWithOpenApi(z);

export interface FirstPartyEndpoint {
  method: 'get' | 'post';
  path: string;
  resource: string;
  priceUsd: number;
  category: string;
  summary: string;
  description: string;
  querySchema?: ZodObject<ZodRawShape>;
  bodySchema?: ZodObject<ZodRawShape>;
  responseSchema: ZodType;
}

const QueryWithSymbol = z.object({ symbol: SymbolSchema, timeframe: TimeframeSchema.optional() });

/**
 * The 8 first-party metered endpoints, described once here so this module
 * can generate their OpenAPI document from the same Zod schemas the routes
 * validate against — see routes/register-metered-route.ts, which every one
 * of these is wired through. Keep this list in sync with routes/index.ts;
 * there's no way to introspect it automatically without deeper surgery on
 * registerMeteredRoute itself, which isn't worth it for 8 stable endpoints.
 */
export const FIRST_PARTY_ENDPOINTS: FirstPartyEndpoint[] = [
  {
    method: 'get',
    path: '/v1/analyze',
    resource: '/v1/analyze',
    priceUsd: 0.05,
    category: 'Intelligence',
    summary: 'Full trade analysis for an asset',
    description: 'Action, confidence, risk, and the reasoning behind them for a given symbol.',
    querySchema: QueryWithSymbol,
    responseSchema: AnalyzeResponseSchema,
  },
  {
    method: 'get',
    path: '/v1/market-summary',
    resource: '/v1/market-summary',
    priceUsd: 0.02,
    category: 'Intelligence',
    summary: 'Market summary for an asset',
    description: 'Price, 24h change, volume, liquidity and volatility for a given symbol.',
    querySchema: QueryWithSymbol,
    responseSchema: MarketSummaryResponseSchema,
  },
  {
    method: 'get',
    path: '/v1/sentiment',
    resource: '/v1/sentiment',
    priceUsd: 0.02,
    category: 'Intelligence',
    summary: 'Sentiment snapshot',
    description: 'Fear/greed index and news sentiment for a symbol, or the whole market.',
    querySchema: z.object({ symbol: SymbolSchema.optional() }),
    responseSchema: SentimentResponseSchema,
  },
  {
    method: 'get',
    path: '/v1/risk-analysis',
    resource: '/v1/risk-analysis',
    priceUsd: 0.03,
    category: 'Intelligence',
    summary: 'Risk analysis for an asset',
    description: 'Risk level/score, volatility, liquidity and drawdown risk for a given symbol.',
    querySchema: QueryWithSymbol,
    responseSchema: RiskAnalysisResponseSchema,
  },
  {
    method: 'get',
    path: '/v1/technical-summary',
    resource: '/v1/technical-summary',
    priceUsd: 0.03,
    category: 'Intelligence',
    summary: 'Technical analysis summary',
    description: 'Trend, momentum, support/resistance for a given symbol.',
    querySchema: QueryWithSymbol,
    responseSchema: TechnicalSummaryResponseSchema,
  },
  {
    method: 'get',
    path: '/v1/trending-assets',
    resource: '/v1/trending-assets',
    priceUsd: 0.02,
    category: 'Intelligence',
    summary: 'Trending assets',
    description: 'Ranked list of currently trending assets.',
    querySchema: z.object({ limit: z.coerce.number().int().positive().max(100).optional() }),
    responseSchema: TrendingAssetsResponseSchema,
  },
  {
    method: 'post',
    path: '/v1/portfolio-health',
    resource: '/v1/portfolio-health',
    priceUsd: 0.04,
    category: 'Intelligence',
    summary: 'Portfolio health check',
    description: 'Diversification, risk score and concentration warnings for a set of holdings.',
    bodySchema: PortfolioHealthRequestSchema,
    responseSchema: PortfolioHealthResponseSchema,
  },
  {
    method: 'get',
    path: '/v1/execution-readiness',
    resource: '/v1/execution-readiness',
    priceUsd: 0.03,
    category: 'Intelligence',
    summary: 'Execution readiness check',
    description: 'Whether now is a structurally sound time to execute a trade in a given symbol.',
    querySchema: QueryWithSymbol,
    responseSchema: ExecutionReadinessResponseSchema,
  },
];

let cached: OpenAPIObject | undefined;

/**
 * Generated once per process (these 8 endpoints' schemas don't change at
 * runtime) and cached in memory — first-party specs are derived from code,
 * not user input, so there's nothing to persist per Phase 4's note on
 * `packages/database/prisma/schema.prisma`.
 */
export function getFirstPartyOpenApiDocument(): OpenAPIObject {
  if (cached) return cached;

  const registry = new OpenAPIRegistry();

  for (const endpoint of FIRST_PARTY_ENDPOINTS) {
    registry.registerPath({
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      description: endpoint.description,
      tags: [endpoint.category],
      request: {
        query: endpoint.querySchema,
        body: endpoint.bodySchema
          ? { content: { 'application/json': { schema: endpoint.bodySchema } }, required: true }
          : undefined,
      },
      responses: {
        200: {
          description: 'Success',
          content: { 'application/json': { schema: endpoint.responseSchema } },
        },
        402: { description: 'Payment required (x402) — see X-PAYMENT / PAYMENT-REQUIRED headers.' },
        429: { description: 'Rate limited.' },
      },
      // agentmarket-specific metadata (price, x402 resource id) — a
      // vendor extension, not a standard OpenAPI field.
      'x-agentmarket': { priceUsd: endpoint.priceUsd, resource: endpoint.resource, metered: true },
    });
  }

  cached = new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'AgentMarket — First-Party Intelligence API',
      version: '1.0.0',
      description: 'x402-metered market-intelligence endpoints operated directly by AgentMarket.',
    },
  });

  return cached;
}
