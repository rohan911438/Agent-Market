import type { ICache } from '@agentmarket/cache';
import type { ApiConfig } from '@agentmarket/config';
import type { Database } from '@agentmarket/database';
import type { IntelligenceEngine } from '@agentmarket/intelligence-engine';
import type { X402PaymentService } from '@agentmarket/payments';
import type { ApiProviderRegistry } from '@agentmarket/providers';
import type { McpSessionBudgetStore } from './services/mcp-session-budget.js';
import type { RateLimiterService } from './services/rate-limiter.js';

/**
 * Composition root passed into every route/middleware factory. Nothing in
 * routes/ or middleware/ reaches for a global singleton — everything is
 * constructor/parameter injected via this context, which keeps the whole
 * app trivially testable with fakes (see test/helpers/build-test-context.ts).
 */
export interface AppContext {
  config: ApiConfig;
  db: Database;
  cache: ICache;
  providerRegistry: ApiProviderRegistry;
  intelligenceEngine: IntelligenceEngine;
  paymentService: X402PaymentService;
  rateLimiter: RateLimiterService;
  mcpSessionBudgets: McpSessionBudgetStore;
}
