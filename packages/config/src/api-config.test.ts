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

  it('rejects PAYMENT_PROVIDER=mock when NODE_ENV=production', () => {
    expect(() => loadApiConfig({ NODE_ENV: 'production', WALLET_TOKEN_SECRET: 'real-secret' })).toThrow(
      SecretValidationError,
    );
  });

  it('rejects the default WALLET_TOKEN_SECRET when NODE_ENV=production', () => {
    expect(() =>
      loadApiConfig({
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'algorand-x402',
        X402_FACILITATOR_URL: 'https://facilitator.example.com',
        X402_PAY_TO_ADDRESS: 'SOME_ADDRESS',
        X402_USDC_ASSET_ID: '12345',
      }),
    ).toThrow(SecretValidationError);
  });

  it('rejects the default ADMIN_API_KEY when NODE_ENV=production', () => {
    expect(() =>
      loadApiConfig({
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'algorand-x402',
        X402_FACILITATOR_URL: 'https://facilitator.example.com',
        X402_PAY_TO_ADDRESS: 'SOME_ADDRESS',
        X402_USDC_ASSET_ID: '12345',
        WALLET_TOKEN_SECRET: 'real-secret',
      }),
    ).toThrow(SecretValidationError);
  });

  it('accepts a production config with a real payment provider, wallet token secret, and admin key', () => {
    const config = loadApiConfig({
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'algorand-x402',
      X402_FACILITATOR_URL: 'https://facilitator.example.com',
      X402_PAY_TO_ADDRESS: 'SOME_ADDRESS',
      X402_USDC_ASSET_ID: '12345',
      WALLET_TOKEN_SECRET: 'real-secret',
      ADMIN_API_KEY: 'real-admin-secret',
    });
    expect(config.security.walletTokenSecret).toBe('real-secret');
    expect(config.security.adminApiKey).toBe('real-admin-secret');
  });
});
