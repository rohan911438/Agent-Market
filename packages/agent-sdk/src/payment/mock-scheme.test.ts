import type { PaymentRequirement } from '@agentmarket/shared-types';
import { describe, expect, it } from 'vitest';
import { createMockPaymentScheme } from './mock-scheme.js';

const REQUIREMENT: PaymentRequirement = {
  scheme: 'exact',
  network: 'mock',
  maxAmountRequired: '20000',
  resource: '/v1/sentiment',
  description: 'Access to /v1/sentiment',
  mimeType: 'application/json',
  payTo: 'MOCK_PAY_TO_ADDRESS',
  asset: 'MOCK_USDC',
  maxTimeoutSeconds: 60,
};

describe('MockPaymentScheme', () => {
  it('only supports the "mock" network', () => {
    const scheme = createMockPaymentScheme();
    expect(scheme.supports('mock')).toBe(true);
    expect(scheme.supports('algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=')).toBe(false);
  });

  it('builds a payload the server can decode', async () => {
    const scheme = createMockPaymentScheme('MY_ADDRESS');
    const payload = await scheme.createPayload(REQUIREMENT, 1);
    expect(payload.x402Version).toBe(1);
    expect(payload.scheme).toBe('exact');
    expect(payload.network).toBe('mock');
    expect(payload.payload.address).toBe('MY_ADDRESS');
    expect(typeof payload.payload.nonce).toBe('string');
  });

  it('generates a fresh nonce per call so replayed payloads are distinguishable', async () => {
    const scheme = createMockPaymentScheme();
    const a = await scheme.createPayload(REQUIREMENT, 1);
    const b = await scheme.createPayload(REQUIREMENT, 1);
    expect(a.payload.nonce).not.toBe(b.payload.nonce);
  });
});
