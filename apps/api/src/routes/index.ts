import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { registerAnalyzeRoute } from './analyze.route.js';
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
