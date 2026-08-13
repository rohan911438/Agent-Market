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
  /**
   * Live ALGO/USD price, when available, so a provider can offer an
   * additional native-ALGO PaymentRequirement alongside its primary one
   * (e.g. a stablecoin). Omitted when no price feed was reachable — a
   * provider must not offer an ALGO-denominated requirement in that case,
   * since it would have no correct amount to quote.
   */
  algoUsdPrice?: number;
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
  /** The x402 protocol version this provider's facilitator actually speaks — not every provider/facilitator agrees. */
  readonly x402Version: number;
  /**
   * Every requirement this provider is willing to accept for this request,
   * in preference order — becomes the 402 response's `accepts[]` verbatim.
   * Always at least one entry. `PaymentPayload.asset` is how the server
   * later picks which of these a given signed payment was built against.
   */
  getRequirements(context: PaymentContext): PaymentRequirement[];
  verify(payload: PaymentPayload, requirement: PaymentRequirement): Promise<PaymentVerifyResult>;
  settle(payload: PaymentPayload, requirement: PaymentRequirement): Promise<PaymentSettleResult>;
}
