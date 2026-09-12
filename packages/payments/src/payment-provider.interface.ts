import type {
  PaymentPayload,
  PaymentRequirement,
  PaymentSettleResult,
  PaymentVerifyResult,
} from '@rohankumar4179/shared-types';

/**
 * Optional per-route enrichment for the Bazaar discovery descriptor a
 * provider stamps onto each PaymentRequirement (and the 402 body's
 * `extensions.bazaar`). Everything here is illustrative metadata for the
 * discovery catalog — it never affects verification or settlement. Omitted
 * entirely by routes that haven't opted in; the provider then emits a
 * minimal method-only descriptor, which is still enough to get listed.
 */
export interface RouteDiscovery {
  /** Example query string params for a GET/HEAD/DELETE route. */
  queryParams?: Record<string, unknown>;
  /** Request body encoding for a POST/PUT/PATCH route. Defaults to "json". */
  bodyType?: 'json' | 'form-data' | 'text';
  /** Example request body for a body-method route. */
  bodyExample?: Record<string, unknown>;
  /** Example successful response payload. */
  outputExample?: unknown;
}

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
  /**
   * HTTP method of the metered route ("GET", "POST", …). Used only to shape
   * the Bazaar discovery descriptor; absent for callers that don't supply it
   * (a provider then simply omits the discovery descriptor).
   */
  method?: string;
  /** Optional per-route discovery enrichment — see RouteDiscovery. */
  discovery?: RouteDiscovery;
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
  /**
   * Optional x402 v2 extension bag for the 402 response body (`{ bazaar:
   * {...}, "x402-merchant": {...} }`). Returns undefined when the provider
   * has no extensions to declare. Providers without discovery support just
   * don't implement this.
   */
  getResponseExtensions?(context: PaymentContext): Record<string, unknown> | undefined;
}
