import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { registerAgentCardRoute } from './a2a/agent-card.route.js';
import { registerA2ATaskRoutes } from './a2a/tasks.route.js';
import { registerAnalyzeRoute } from './analyze.route.js';
import { registerFirstPartyCatalogRoutes } from './catalog/first-party-catalog.route.js';
import { registerListingCatalogRoutes } from './catalog/listing-catalog.route.js';
import { registerMcpRoutes } from './catalog/mcp.route.js';
import { registerSwaggerUiAssets } from './catalog/swagger-ui.js';
import { registerListingRoutes } from './control-plane/listings.route.js';
import { registerProviderAccountRoutes } from './control-plane/provider-account.route.js';
import { registerDashboardRoute } from './dashboard.route.js';
import { registerExecutionReadinessRoute } from './execution-readiness.route.js';
import { registerHealthRoute } from './health.route.js';
import { registerMarketSummaryRoute } from './market-summary.route.js';
import { registerMarketplaceRoute } from './marketplace.route.js';
import { registerPortfolioHealthRoute } from './portfolio-health.route.js';
import { registerRiskAnalysisRoute } from './risk-analysis.route.js';
import { registerSentimentRoute } from './sentiment.route.js';
import { registerTechnicalSummaryRoute } from './technical-summary.route.js';
import { registerTrendingAssetsRoute } from './trending-assets.route.js';

export function registerRoutes(server: FastifyInstance, ctx: AppContext): void {
  // Free
  registerHealthRoute(server, ctx);
  registerMarketplaceRoute(server, ctx);
  registerDashboardRoute(server, ctx);

  // Control plane — provider onboarding & self-service publishing (Phase 2)
  registerProviderAccountRoutes(server, ctx);
  registerListingRoutes(server, ctx);

  // Protocol-native catalog — OpenAPI/Swagger/Postman/MCP (Phase 4)
  registerSwaggerUiAssets(server);
  registerFirstPartyCatalogRoutes(server, ctx);
  registerListingCatalogRoutes(server, ctx);
  registerMcpRoutes(server, ctx);

  // A2A (Agent-to-Agent) task lifecycle for first-party endpoints (Phase 5)
  registerAgentCardRoute(server, ctx);
  registerA2ATaskRoutes(server, ctx);

  // Metered (x402-gated)
  registerAnalyzeRoute(server, ctx);
  registerMarketSummaryRoute(server, ctx);
  registerSentimentRoute(server, ctx);
  registerRiskAnalysisRoute(server, ctx);
  registerTechnicalSummaryRoute(server, ctx);
  registerTrendingAssetsRoute(server, ctx);
  registerPortfolioHealthRoute(server, ctx);
  registerExecutionReadinessRoute(server, ctx);
}
