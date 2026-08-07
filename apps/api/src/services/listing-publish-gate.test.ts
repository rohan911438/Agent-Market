import { describe, expect, it } from 'vitest';
import { evaluatePublishGate } from './listing-publish-gate.js';

const READY: Parameters<typeof evaluatePublishGate>[0] = {
  providerAccountStatus: 'verified',
  priceUsd: 0.03,
  payoutWalletAddress: 'A'.repeat(58),
  upstreamUrl: 'https://api.example.com/v1/risk',
  description: 'Flags wallets with elevated on-chain risk before a payout.',
};

describe('evaluatePublishGate', () => {
  it('passes when every requirement is met', () => {
    const result = evaluatePublishGate(READY);
    expect(result.ok).toBe(true);
    expect(result.requirements.every((r) => r.met)).toBe(true);
  });

  it('fails when the provider account is not verified', () => {
    const result = evaluatePublishGate({ ...READY, providerAccountStatus: 'pending' });
    expect(result.ok).toBe(false);
    expect(result.requirements.find((r) => r.key === 'provider_verified')?.met).toBe(false);
  });

  it('fails when pricing has not been configured', () => {
    const result = evaluatePublishGate({ ...READY, priceUsd: null });
    expect(result.ok).toBe(false);
    expect(result.requirements.find((r) => r.key === 'pricing_configured')?.met).toBe(false);
  });

  it('fails when a payout wallet has not been configured', () => {
    const result = evaluatePublishGate({ ...READY, payoutWalletAddress: null });
    expect(result.ok).toBe(false);
    expect(result.requirements.find((r) => r.key === 'payment_configured')?.met).toBe(false);
  });

  it('fails when the upstream url is not http(s)', () => {
    const result = evaluatePublishGate({ ...READY, upstreamUrl: 'ftp://example.com' });
    expect(result.ok).toBe(false);
    expect(result.requirements.find((r) => r.key === 'upstream_url_valid')?.met).toBe(false);
  });

  it('fails when the description is too short', () => {
    const result = evaluatePublishGate({ ...READY, description: 'too short' });
    expect(result.ok).toBe(false);
    expect(result.requirements.find((r) => r.key === 'description_present')?.met).toBe(false);
  });

  it('reports every unmet requirement at once rather than short-circuiting', () => {
    const result = evaluatePublishGate({
      providerAccountStatus: 'pending',
      priceUsd: null,
      payoutWalletAddress: null,
      upstreamUrl: 'not-a-url',
      description: 'short',
    });
    expect(result.ok).toBe(false);
    expect(result.requirements.filter((r) => !r.met)).toHaveLength(5);
  });
});
