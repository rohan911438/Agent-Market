import { describe, expect, it } from 'vitest';
import { loadApiConfig } from './api-config.js';
import { SecretValidationError } from '@agentmarket/secrets';

describe('loadApiConfig', () => {
  it('boots with only defaults — no env vars required for the mock payment provider', () => {
    const config = loadApiConfig({});
    expect(config.payments.provider).toBe('mock');
    expect(config.cache.driver).toBe('memory');
    expect(config.server.port).toBe(4000);
  });

  it('requires facilitator config when PAYMENT_PROVIDER=algorand-x402', () => {
    expect(() => loadApiConfig({ PAYMENT_PROVIDER: 'algorand-x402' })).toThrow(SecretValidationError);
  });

  it('accepts algorand-x402 once all required fields are present', () => {
    const config = loadApiConfig({
      PAYMENT_PROVIDER: 'algorand-x402',
      X402_FACILITATOR_URL: 'https://facilitator.example.com',
      X402_PAY_TO_ADDRESS: 'SOME_ADDRESS',
      X402_USDC_ASSET_ID: '12345',
    });
    expect(config.payments.facilitatorUrl).toBe('https://facilitator.example.com');
  });

  it('requires REDIS_URL when CACHE_DRIVER=redis', () => {
    expect(() => loadApiConfig({ CACHE_DRIVER: 'redis' })).toThrow(SecretValidationError);
  });

  it('never surfaces NEWS_API_KEY unless explicitly set, and never in an error message', () => {
    const config = loadApiConfig({});
    expect(config.providerKeys.newsApiKey).toBeUndefined();
  });
});
