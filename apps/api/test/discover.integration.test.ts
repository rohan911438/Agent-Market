import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

async function publishListing(
  server: FastifyInstance,
  opts: { email: string; wallet: string; slug: string; name: string; description: string; priceUsd?: number },
): Promise<{ listingId: string }> {
  const register = await server.inject({
    method: 'POST',
    url: '/v1/providers/register',
    payload: { name: `Discover Test ${opts.slug}`, email: opts.email, walletAddress: opts.wallet },
  });
  const apiKey = register.json().apiKey;

  await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });

  const create = await server.inject({
    method: 'POST',
    url: '/v1/listings',
    headers: { authorization: `Bearer ${apiKey}` },
    payload: {
      slug: opts.slug,
      name: opts.name,
      description: opts.description,
      category: 'Test',
      upstreamUrl: `https://api.example.com/${opts.slug}`,
    },
  });
  const listingId = create.json().id;

  await server.inject({
    method: 'PATCH',
    url: `/v1/listings/${listingId}/pricing`,
    headers: { authorization: `Bearer ${apiKey}` },
    payload: { pricingModel: 'pay_per_call', priceUsd: opts.priceUsd ?? 0.03 },
  });
  await server.inject({
    method: 'PATCH',
    url: `/v1/listings/${listingId}/payment`,
    headers: { authorization: `Bearer ${apiKey}` },
    payload: { payoutWalletAddress: opts.wallet },
  });
  await server.inject({ method: 'POST', url: `/v1/listings/${listingId}/publish`, headers: { authorization: `Bearer ${apiKey}` } });

  return { listingId };
}

describe('POST /v1/discover (Phase 11)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer(buildTestContext());
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('rejects a request with no task', async () => {
    const res = await server.inject({ method: 'POST', url: '/v1/discover', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('requires no auth — a public discovery primitive', async () => {
    const res = await server.inject({ method: 'POST', url: '/v1/discover', payload: { task: 'anything' } });
    expect(res.statusCode).not.toBe(401);
  });

  describe('ranking against a real published catalog', () => {
    let walletRiskListingId: string;
    let sentimentListingId: string;

    beforeAll(async () => {
      const walletRisk = await publishListing(server, {
        email: 'discover-wallet-risk@ledgerwatch.test',
        wallet: 'Q'.repeat(58),
        slug: 'discover-wallet-risk',
        name: 'ChainScan Wallet Risk',
        description: 'Flags wallets with elevated on-chain risk before a payout, scored from live transaction graphs.',
        priceUsd: 0.03,
      });
      walletRiskListingId = walletRisk.listingId;

      const sentiment = await publishListing(server, {
        email: 'discover-sentiment@ledgerwatch.test',
        wallet: 'R'.repeat(58),
        slug: 'discover-sentiment',
        name: 'Sentiment Index',
        description: 'Fear and Greed index plus optional news sentiment, normalized into one score.',
        priceUsd: 0.02,
      });
      sentimentListingId = sentiment.listingId;
    });

    // Other integration test files publish their own fixture listings into
    // this same shared test database (see global-setup.ts) and run first, so
    // asserting a global #1 across the *entire* catalog wouldn't be robust —
    // that exact-ordering guarantee is already covered precisely by
    // discovery-ranking.test.ts's controlled fixtures. This test instead
    // verifies the real end-to-end wiring: our own closely-matching listing
    // outranks our own clearly-irrelevant one, with a well-formed response.
    it('ranks our closely-matching listing above our clearly-irrelevant one, with a well-formed listing/score/reasons response', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/discover',
        payload: { task: 'flag wallets with elevated risk before a payout' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.results)).toBe(true);

      const walletRiskResult = body.results.find((r: { listing: { id: string } }) => r.listing.id === walletRiskListingId);
      const sentimentResult = body.results.find((r: { listing: { id: string } }) => r.listing.id === sentimentListingId);

      expect(walletRiskResult).toBeDefined();
      expect(sentimentResult).toBeDefined();
      expect(walletRiskResult.score).toBeGreaterThan(sentimentResult.score);
      expect(typeof walletRiskResult.score).toBe('number');
      expect(Array.isArray(walletRiskResult.reasons)).toBe(true);
      expect(walletRiskResult.reasons.length).toBeGreaterThan(0);
      expect(walletRiskResult.listing.slug).toBe('discover-wallet-risk');
    });

    it('includes a listing priced at or below maxCostPerCall', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/discover',
        payload: { task: 'wallet risk', constraints: { maxCostPerCall: 0.03 } },
      });
      const ids = res.json().results.map((r: { listing: { id: string } }) => r.listing.id);
      expect(ids).toContain(walletRiskListingId);
    });

    it('excludes a listing priced above maxCostPerCall', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/discover',
        payload: { task: 'wallet risk', constraints: { maxCostPerCall: 0.025 } }, // below the 0.03 wallet-risk listing's price
      });
      const ids = res.json().results.map((r: { listing: { id: string } }) => r.listing.id);
      expect(ids).not.toContain(walletRiskListingId);
    });
  });
});
