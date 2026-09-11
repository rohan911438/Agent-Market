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

  it('preserves an echoed `extensions` bag through round-trip decode — regression for the Bazaar discovery bug', () => {
    // A real settled MainNet payment (2026-09-11) was recorded by the
    // GoPlausible facilitator's leaderboard with bazaar:false, challenge:false
    // because this field didn't exist yet: `PaymentPayloadSchema.parse` (zod
    // strips unknown keys by default) silently dropped any `extensions` a
    // client echoed back from the 402 response before it ever reached
    // AlgorandX402Provider.settle()/verify() — see docs/PAYMENT_FLOW.md.
    const payload: PaymentPayload = {
      x402Version: 2,
      scheme: 'exact',
      network: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
      payload: { paymentGroup: ['AAAA'], paymentIndex: 0 },
      extensions: { bazaar: { info: { input: { type: 'http', method: 'GET' } } } },
    };
    const header = encodePaymentPayload(payload);
    expect(decodePaymentHeader(header)).toEqual(payload);
  });
});
