import type {
  PaymentPayload,
  PaymentRequirement,
  PaymentSettleResult,
  PaymentVerifyResult,
} from '@agentmarket/shared-types';

export interface PaymentContext {
  /** Route path being metered, e.g. "/v1/analyze". */
  resource: string;
  priceUsd: number;
}

/**
 * The only interface route handlers/middleware ever talk to for payment
 * logic. Swapping payment rails (a different chain, a different
 * facilitator, a non-x402 scheme entirely) means writing one new class
 * that implements this interface and pointing PAYMENT_PROVIDER at it —
 * never touching the middleware or route code.
 */
export interface PaymentProvider {
  readonly id: string;
  getRequirements(context: PaymentContext): PaymentRequirement;
  verify(payload: PaymentPayload, requirement: PaymentRequirement): Promise<PaymentVerifyResult>;
  settle(payload: PaymentPayload, requirement: PaymentRequirement): Promise<PaymentSettleResult>;
}
