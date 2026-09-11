import { describe, expect, it } from 'vitest';
import { MockPaymentProvider } from './mock-payment-provider.js';
import { X402PaymentService } from './x402-payment-service.js';
import { encodePaymentPayload } from './x402-header-codec.js';
import type { PaymentPayload } from '@agentmarket/shared-types';

describe('X402PaymentService', () => {
  it('returns kind "missing" when no X-PAYMENT header is present', async () => {
    const service = new X402PaymentService(new MockPaymentProvider());
    const { requirements } = service.buildPaymentRequired('/v1/analyze', 0.05);
    const result = await service.processIncomingPayment(undefined, requirements);
    expect(result.kind).toBe('missing');
  });

  it('returns kind "malformed" for an unparseable header', async () => {
    const service = new X402PaymentService(new MockPaymentProvider());
    const { requirements } = service.buildPaymentRequired('/v1/analyze', 0.05);
    const result = await service.processIncomingPayment('not-base64-json!!!', requirements);
    expect(result.kind).toBe('malformed');
  });

  it('verifies a well-formed payment and returns a stable paymentRef', async () => {
    const service = new X402PaymentService(new MockPaymentProvider());
    const { requirements } = service.buildPaymentRequired('/v1/analyze', 0.05);
    const payload: PaymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'mock',
      payload: { nonce: 'abc-123', address: 'WALLETADDR' },
    };
    const header = encodePaymentPayload(payload);

    const result = await service.processIncomingPayment(header, requirements);
    expect(result.kind).toBe('verified');
    if (result.kind === 'verified') {
      expect(result.paymentRef).toBe('abc-123');
      expect(result.payerAddress).toBe('WALLETADDR');
    }
  });

  it('produces the same paymentRef for a replayed identical payload (idempotency)', async () => {
    const service = new X402PaymentService(new MockPaymentProvider());
    const { requirements } = service.buildPaymentRequired('/v1/analyze', 0.05);
    const payload: PaymentPayload = { x402Version: 1, scheme: 'exact', network: 'mock', payload: { nonce: 'same-nonce' } };
    const header = encodePaymentPayload(payload);

    const first = await service.processIncomingPayment(header, requirements);
    const second = await service.processIncomingPayment(header, requirements);
    expect(first.kind).toBe('verified');
    expect(second.kind).toBe('verified');
    if (first.kind === 'verified' && second.kind === 'verified') {
      expect(first.paymentRef).toBe(second.paymentRef);
    }
  });
});
