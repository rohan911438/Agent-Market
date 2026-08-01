import { createCache } from '@agentmarket/cache';
import { loadApiConfig, type ApiConfig } from '@agentmarket/config';
import { createPrismaClient, Database } from '@agentmarket/database';
import { IntelligenceEngine, RuleBasedExplainer } from '@agentmarket/intelligence-engine';
import { createPaymentProviderRegistry, X402PaymentService } from '@agentmarket/payments';
import { createProviderRegistry } from '@agentmarket/providers';
import { Redis } from 'ioredis';
import type { AppContext } from './context.js';
import { RateLimiterService } from './services/rate-limiter.js';

/** Single place that wires every package's factory into a running AppContext — the app's composition root. */
export function buildContext(overrideConfig?: ApiConfig): AppContext {
  const config = overrideConfig ?? loadApiConfig();

  const db = new Database(createPrismaClient(config.database.url));
  // packages/cache stays client-agnostic (see its factory.ts) — the concrete
  // redis client lives here, in the one place allowed to know about it.
  const redisClient = config.cache.driver === 'redis' ? new Redis(config.cache.redisUrl!) : undefined;
  const cache = createCache(config.cache.driver, redisClient);
  const providerRegistry = createProviderRegistry({ newsApiKey: config.providerKeys.newsApiKey });
  const intelligenceEngine = new IntelligenceEngine(providerRegistry, new RuleBasedExplainer());

  const { activeProvider } = createPaymentProviderRegistry({
    activeProviderId: config.payments.provider,
    algorand:
      config.payments.provider === 'algorand-x402'
        ? {
            facilitatorUrl: config.payments.facilitatorUrl!,
            network: config.payments.algorandNetwork,
            payToAddress: config.payments.payToAddress!,
            usdcAssetId: config.payments.usdcAssetId!,
            feePayerAddress: config.payments.feePayerAddress,
          }
        : undefined,
  });

  const paymentService = new X402PaymentService(activeProvider);
  const rateLimiter = new RateLimiterService(cache);

  return { config, db, cache, providerRegistry, intelligenceEngine, paymentService, rateLimiter };
}
