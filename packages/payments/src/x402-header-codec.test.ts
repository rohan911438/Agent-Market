import { describe, expect, it } from 'vitest';
import { decodePaymentHeader, encodePaymentPayload } from './x402-header-codec.js';
import type { PaymentPayload } from '@rohankumar4179/shared-types';

describe('x402 header codec', () => {
  it('round-trips a payload through encode/decode', () => {
    const payload: PaymentPayload = { x402Version: 1, scheme: 'exact', network: 'algorand-testnet', payload: { nonce: 'n1' } };
    const header = encodePaymentPayload(payload);
    expect(decodePaymentHeader(header)).toEqual(payload);
  });

  it('throws a descriptive error for invalid base64', () => {
    expect(() => decodePaymentHeader('%%%not-base64%%%')).toThrow();
  });

  it('throws for base64 that decodes to invalid JSON', () => {
    const header = Buffer.from('not json', 'utf-8').toString('base64');
    expect(() => decodePaymentHeader(header)).toThrow();
  });

  it('throws for JSON that does not match the PaymentPayload schema', () => {
    const header = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf-8').toString('base64');
    expect(() => decodePaymentHeader(header)).toThrow();
  });
});
