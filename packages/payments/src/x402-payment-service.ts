import type { PaymentPayload, PaymentRequiredResponse, PaymentRequirement } from '@agentmarket/shared-types';
import type { PaymentProvider } from './payment-provider.interface.js';
import { decodePaymentHeader } from './x402-header-codec.js';

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
  ): { body: PaymentRequiredResponse; requirements: PaymentRequirement[]; requirement: PaymentRequirement } {
    const requirements = this.provider.getRequirements({ resource, priceUsd, algoUsdPrice });
    return {
      body: {
        x402Version: this.provider.x402Version,
        error: 'Payment required — see accepts[] for terms',
        accepts: requirements,
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
