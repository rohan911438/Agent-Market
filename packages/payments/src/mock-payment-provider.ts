import { createHash } from 'node:crypto';
import type {
  PaymentPayload,
  PaymentRequirement,
  PaymentSettleResult,
  PaymentVerifyResult,
} from '@rohankumar4179/shared-types';
import type { PaymentContext, PaymentProvider } from './payment-provider.interface.js';

/**
 * In-process fake facilitator so the full 402 -> pay -> 200 flow can be
 * exercised in local dev, CI, and integration tests with no TestNet funds
 * or network access. Always "verifies" and "settles" successfully;
 * paymentRef is derived deterministically from the payload so replaying
 * the exact same X-PAYMENT body is still idempotent, matching real
 * facilitator behavior.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';
  readonly x402Version = 1;

  getRequirements(context: PaymentContext): PaymentRequirement[] {
    return [
      {
        scheme: 'exact',
        network: 'mock',
        maxAmountRequired: Math.round(context.priceUsd * 1_000_000).toString(),
        resource: context.resource,
        description: `Access to ${context.resource} (mock payment provider — dev/test only)`,
        mimeType: 'application/json',
        payTo: 'MOCK_PAY_TO_ADDRESS',
        asset: 'MOCK_USDC',
        maxTimeoutSeconds: 60,
      },
    ];
  }

  async verify(payload: PaymentPayload): Promise<PaymentVerifyResult> {
    const address = payload.payload.address;
    return {
      isValid: true,
      payerAddress: typeof address === 'string' ? address : 'MOCK_PAYER_ADDRESS',
      paymentRef: this.paymentRef(payload),
    };
  }

  async settle(payload: PaymentPayload): Promise<PaymentSettleResult> {
    return { success: true, transactionId: `mock-tx-${this.paymentRef(payload)}`, network: 'mock' };
  }

  private paymentRef(payload: PaymentPayload): string {
    const explicit = payload.payload.nonce ?? payload.payload.txId;
    if (typeof explicit === 'string') return explicit;
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
  }
}
