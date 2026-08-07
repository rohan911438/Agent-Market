import type { PublishRequirement } from '@agentmarket/shared-types';

export interface PublishGateInput {
  providerAccountStatus: string;
  priceUsd: number | null;
  payoutWalletAddress: string | null;
  upstreamUrl: string;
  description: string;
}

export interface PublishGateResult {
  ok: boolean;
  requirements: PublishRequirement[];
}

/**
 * The "Verify" gate a listing has to clear before Publish, made concrete —
 * see the publishing pipeline diagram in the platform strategy doc. Kept as
 * a pure function (no I/O) so the rules are unit-testable without a
 * database, and so a future real health/security check can be added here
 * without touching the route that calls it.
 */
export function evaluatePublishGate(input: PublishGateInput): PublishGateResult {
  const requirements: PublishRequirement[] = [
    {
      key: 'provider_verified',
      met: input.providerAccountStatus === 'verified',
      message: 'Provider account must pass verification before publishing (POST /v1/providers/verify).',
    },
    {
      key: 'pricing_configured',
      met: input.priceUsd !== null && input.priceUsd > 0,
      message: 'Configure a price before publishing (PATCH /v1/listings/:id/pricing).',
    },
    {
      key: 'payment_configured',
      met: Boolean(input.payoutWalletAddress),
      message: 'Configure a payout wallet before publishing (PATCH /v1/listings/:id/payment).',
    },
    {
      key: 'upstream_url_valid',
      met: /^https?:\/\//i.test(input.upstreamUrl),
      message: 'upstreamUrl must be a valid http(s) URL.',
    },
    {
      key: 'description_present',
      met: input.description.trim().length >= 10,
      message: 'Description must be at least 10 characters.',
    },
  ];

  return { ok: requirements.every((r) => r.met), requirements };
}
