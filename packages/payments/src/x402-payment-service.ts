import type { PaymentPayload, PaymentRequiredResponse, PaymentRequirement, ResourceInfo } from '@rohankumar4179/shared-types';
import type { PaymentProvider, RouteDiscovery } from './payment-provider.interface.js';
import { decodePaymentHeader } from './x402-header-codec.js';

/** Per-request routing metadata that shapes the Bazaar discovery descriptor and the spec-required top-level `resource` object. */
export interface BuildPaymentRequiredContext {
  method?: string;
  discovery?: RouteDiscovery;
  /**
   * Absolute origin (e.g. `https://agentmarket-api-bedc.onrender.com`) of the
   * current request — this repo's own `resource` string (e.g. `/v1/analyze`)
   * is deliberately a relative route path used for internal bookkeeping, not
   * the absolute URL the x402 v2 spec's `ResourceInfo.url` requires. Without
   * an origin, `resource` is omitted from the 402 body entirely (degrades
   * gracefully — payment itself still works, only Bazaar cataloging is
   * affected) rather than emitting a relative URL a facilitator can't use.
   */
  origin?: string;
}

export type IncomingPaymentResult =
  | { kind: 'missing' }
  | { kind: 'malformed'; reason: string }
  | { kind: 'invalid'; reason?: string }
  | {
      kind: 'verified';
      payload: PaymentPayload;
      payerAddress?: string;
      paymentRef: string;
      /** Which accepts[] entry this payload matched — pass to settle() and to any bookkeeping that needs the actual amount/asset/network paid. */
      requirement: PaymentRequirement;
    };

/**
 * Framework-agnostic x402 protocol logic — building the 402 body and
 * processing the client's X-PAYMENT header. HTTP framework wiring
 * (Fastify hooks) and persistence (idempotency lookups) live in apps/api;
 * this class only knows the payment protocol.
 */
export class X402PaymentService {
  constructor(private readonly provider: PaymentProvider) {}

  buildPaymentRequired(
    resource: string,
    priceUsd: number,
    algoUsdPrice?: number,
    routeContext?: BuildPaymentRequiredContext,
  ): { body: PaymentRequiredResponse; requirements: PaymentRequirement[]; requirement: PaymentRequirement } {
    const context = {
      resource,
      priceUsd,
      algoUsdPrice,
      method: routeContext?.method,
      discovery: routeContext?.discovery,
    };
    const requirements = this.provider.getRequirements(context);
    const extensions = this.provider.getResponseExtensions?.(context);
    const resourceInfo: ResourceInfo | undefined = routeContext?.origin
      ? { url: `${routeContext.origin}${resource}`, description: `Access to ${resource}`, mimeType: 'application/json' }
      : undefined;
    return {
      body: {
        x402Version: this.provider.x402Version,
        error: 'Payment required — see accepts[] for terms',
        accepts: requirements,
        ...(extensions ? { extensions } : {}),
        ...(resourceInfo ? { resource: resourceInfo } : {}),
      },
      requirements,
      // Convenience default (accepts[0]) for callers that only ever deal in
      // a single requirement — every provider that offers just one still
      // works with this unchanged.
      requirement: requirements[0]!,
    };
  }

  async processIncomingPayment(
    headerValue: string | undefined,
    requirements: PaymentRequirement[],
  ): Promise<IncomingPaymentResult> {
    if (!headerValue) return { kind: 'missing' };

    let payload: PaymentPayload;
    try {
      payload = decodePaymentHeader(headerValue);
    } catch (err) {
      return { kind: 'malformed', reason: err instanceof Error ? err.message : 'invalid X-PAYMENT header' };
    }

    // Which accepts[] entry this payload was built against — see
    // PaymentPayloadSchema.asset. Falls back to the first (and for every
    // provider that only ever offers one requirement, only) entry.
    const requirement = (payload.asset ? requirements.find((r) => r.asset === payload.asset) : undefined) ?? requirements[0]!;

    const result = await this.provider.verify(payload, requirement);
    if (!result.isValid) return { kind: 'invalid', reason: result.invalidReason };

    return {
      kind: 'verified',
      payload,
      payerAddress: result.payerAddress,
      paymentRef: result.paymentRef ?? this.fallbackRef(payload),
      requirement,
    };
  }

  settle(payload: PaymentPayload, requirement: PaymentRequirement) {
    return this.provider.settle(payload, requirement);
  }

  private fallbackRef(payload: PaymentPayload): string {
    return JSON.stringify(payload.payload).slice(0, 64);
  }
}
