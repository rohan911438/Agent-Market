import { createCache } from '@agentmarket/cache';
import type { ApiConfig } from '@agentmarket/config';
import { createPrismaClient, Database } from '@agentmarket/database';
import { IntelligenceEngine, RuleBasedExplainer } from '@agentmarket/intelligence-engine';
import { createPaymentProviderRegistry, X402PaymentService } from '@agentmarket/payments';
import type { AppContext } from '../../src/context.js';
import { initTracingForTests } from '../../src/observability/tracing.js';
import { McpSessionBudgetStore } from '../../src/services/mcp-session-budget.js';
import { RateLimiterService } from '../../src/services/rate-limiter.js';
import { buildMockProviderRegistry } from './mock-provider-registry.js';

export function buildTestConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    env: 'test',
    isProduction: false,
    server: { port: 0, host: '127.0.0.1', corsOrigin: '*', logLevel: 'error' },
    database: { url: process.env.DATABASE_URL! },
    cache: { driver: 'memory' },
    payments: { provider: 'mock', algorandNetwork: 'testnet' },
    rateLimits: { anonymousPerMinute: 1000, walletVerifiedPerMinute: 1000, dailySpendCapUsd: 1000 },
    providerKeys: {},
    security: { walletTokenSecret: 'test-wallet-token-secret', adminApiKey: 'test-admin-api-key' },
    ...overrides,
  };
}

export function buildTestContext(overrides: Partial<ApiConfig> = {}): AppContext {
  initTracingForTests();

  const config = buildTestConfig(overrides);
  const db = new Database(createPrismaClient(config.database.url));
  const cache = createCache('memory');
  const providerRegistry = buildMockProviderRegistry();
  const intelligenceEngine = new IntelligenceEngine(providerRegistry, new RuleBasedExplainer());
  const { activeProvider } = createPaymentProviderRegistry({ activeProviderId: 'mock' });
  const paymentService = new X402PaymentService(activeProvider);
  const rateLimiter = new RateLimiterService(cache);
  const mcpSessionBudgets = new McpSessionBudgetStore(cache);

  return { config, db, cache, providerRegistry, intelligenceEngine, paymentService, rateLimiter, mcpSessionBudgets };
}
