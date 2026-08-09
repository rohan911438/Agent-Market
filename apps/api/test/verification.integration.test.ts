import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

const ADMIN_KEY = 'test-admin-api-key'; // must match buildTestConfig's security.adminApiKey
const WALLET = 'E'.repeat(58);

describe('trust & verification ladder', () => {
  let server: FastifyInstance;
  const ctx = buildTestContext();

  beforeAll(async () => {
    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('admin auth', () => {
    it('rejects the security-audit action with no Authorization header', async () => {
      const res = await server.inject({ method: 'POST', url: '/v1/admin/providers/some-id/security-audit' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('rejects the security-audit action with the wrong admin key', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/admin/providers/some-id/security-audit',
        headers: { authorization: 'Bearer not-the-admin-key' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('404s for an unknown provider id even with a valid admin key', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/admin/providers/does-not-exist/security-audit',
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('the ladder for a single provider', () => {
    let apiKey: string;
    let providerId: string;

    beforeAll(async () => {
      const register = await server.inject({
        method: 'POST',
        url: '/v1/providers/register',
        payload: { name: 'Trust Ladder Test', email: 'trust-ladder@ledgerwatch.test', walletAddress: WALLET },
      });
      apiKey = register.json().apiKey;
      providerId = register.json().providerId;
    });

    it('starts at the "unverified" tier before verification', async () => {
      const res = await server.inject({ method: 'GET', url: '/v1/providers/me', headers: { authorization: `Bearer ${apiKey}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().verificationTier).toBe('unverified');
      expect(typeof res.json().trustScore).toBe('number');
    });

    it('reaches "verified" (not "verified_enterprise") once verified, with no audit — the negative case', async () => {
      const verify = await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });
      expect(verify.statusCode).toBe(200);
      expect(verify.json().verificationTier).toBe('verified');
      expect(verify.json().verificationTier).not.toBe('verified_enterprise');

      const me = await server.inject({ method: 'GET', url: '/v1/providers/me', headers: { authorization: `Bearer ${apiKey}` } });
      expect(me.json().verificationTier).toBe('verified');
    });

    it('cannot reach "verified_enterprise" via any provider-facing action — only the admin endpoint sets it', async () => {
      const me = await server.inject({ method: 'GET', url: '/v1/providers/me', headers: { authorization: `Bearer ${apiKey}` } });
      expect(me.json().verificationTier).not.toBe('verified_enterprise');
    });

    it('reaches "verified_enterprise" once an admin records a passed security audit', async () => {
      const audit = await server.inject({
        method: 'POST',
        url: `/v1/admin/providers/${providerId}/security-audit`,
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
      });
      expect(audit.statusCode).toBe(200);
      expect(audit.json().verificationTier).toBe('verified_enterprise');

      const me = await server.inject({ method: 'GET', url: '/v1/providers/me', headers: { authorization: `Bearer ${apiKey}` } });
      expect(me.json().verificationTier).toBe('verified_enterprise');
    });
  });

  describe('GET /v1/marketplace', () => {
    it('includes providerTrustScore and providerVerificationTier on every third-party entry', async () => {
      const register = await server.inject({
        method: 'POST',
        url: '/v1/providers/register',
        payload: { name: 'Marketplace Trust Test', email: 'marketplace-trust@ledgerwatch.test', walletAddress: 'F'.repeat(58) },
      });
      const apiKey = register.json().apiKey;

      await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });

      const create = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug: 'trust-ladder-listing-test',
          name: 'Trust Ladder Listing',
          description: 'Fixture listing for the marketplace trust field test.',
          category: 'Test',
          upstreamUrl: 'https://api.example.com/trust',
        },
      });
      const listingId = create.json().id;

      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/pricing`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { pricingModel: 'pay_per_call', priceUsd: 0.02 },
      });
      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/payment`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { payoutWalletAddress: 'F'.repeat(58) },
      });
      await server.inject({
        method: 'POST',
        url: `/v1/listings/${listingId}/publish`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      const marketplace = await server.inject({ method: 'GET', url: '/v1/marketplace' });
      expect(marketplace.statusCode).toBe(200);
      const listing = marketplace.json().apis.find((a: { slug: string }) => a.slug === 'trust-ladder-listing-test');
      expect(listing).toBeDefined();
      expect(typeof listing.providerTrustScore).toBe('number');
      expect(listing.providerVerificationTier).toBe('verified');
    });

    it('omits provider trust fields on first-party entries — they have no provider account to score', async () => {
      // Not seeded by global-setup.ts's `prisma db push` — inserted directly
      // so there's a first-party row to assert against.
      await ctx.db.prisma.marketplaceApi.create({
        data: {
          slug: 'trust-ladder-first-party-fixture',
          name: 'First-Party Fixture',
          description: 'Fixture first-party endpoint for the marketplace trust field test.',
          category: 'Test',
          priceUsd: 0.01,
          endpoint: '/v1/first-party-fixture',
          status: 'live',
        },
      });

      const marketplace = await server.inject({ method: 'GET', url: '/v1/marketplace' });
      const firstParty = marketplace
        .json()
        .apis.find((a: { slug: string }) => a.slug === 'trust-ladder-first-party-fixture');
      expect(firstParty).toBeDefined();
      expect(firstParty.providerTrustScore).toBeUndefined();
      expect(firstParty.providerVerificationTier).toBeUndefined();
    });
  });
});
