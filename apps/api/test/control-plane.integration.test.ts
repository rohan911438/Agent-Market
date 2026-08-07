import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

const WALLET_A = 'A'.repeat(58);
const WALLET_B = 'B'.repeat(58);

describe('control plane — register, verify, publish', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer(buildTestContext());
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('registers a provider account and returns a one-time API key', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'Ledgerwatch Labs', email: 'devrel@ledgerwatch.test', walletAddress: WALLET_A },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.apiKey.startsWith('amk_')).toBe(true);
  });

  it('rejects a second registration with the same email', async () => {
    await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'Dup', email: 'dup@ledgerwatch.test', walletAddress: WALLET_B },
    });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'Dup Again', email: 'dup@ledgerwatch.test', walletAddress: WALLET_B },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('rejects a malformed wallet address at registration', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'Bad Wallet', email: 'bad-wallet@ledgerwatch.test', walletAddress: 'not-an-address' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects control-plane routes with no Authorization header', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/providers/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects control-plane routes with a garbage bearer token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/v1/providers/me',
      headers: { authorization: 'Bearer amk_not_a_real_key' },
    });
    expect(res.statusCode).toBe(401);
  });

  describe('the full publishing pipeline', () => {
    let apiKey: string;
    let listingId: string;

    beforeAll(async () => {
      const register = await server.inject({
        method: 'POST',
        url: '/v1/providers/register',
        payload: { name: 'Pipeline Provider', email: 'pipeline@ledgerwatch.test', walletAddress: WALLET_A },
      });
      apiKey = register.json().apiKey;

      const create = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug: 'chainscan-wallet-risk-test',
          name: 'ChainScan — Wallet Risk Feed',
          description: 'Flags wallets with elevated on-chain risk before a payout.',
          category: 'Risk & Compliance',
          tags: ['wallets', 'fraud'],
          upstreamUrl: 'https://api.ledgerwatch.test/v1/wallet-risk',
        },
      });
      listingId = create.json().id;
    });

    it('creates the listing as a draft', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/listings/${listingId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('draft');
    });

    it('refuses to publish before verification, pricing or payment are configured', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/v1/listings/${listingId}/publish`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe('PUBLISH_REQUIREMENTS_NOT_MET');
      const unmet = body.error.details.requirements.filter((r: { met: boolean }) => !r.met);
      expect(unmet.map((r: { key: string }) => r.key)).toEqual(
        expect.arrayContaining(['provider_verified', 'pricing_configured', 'payment_configured']),
      );
    });

    it('verifies the provider account', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/providers/verify',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('verified');
    });

    it('configures pricing', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/pricing`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { pricingModel: 'pay_per_call', priceUsd: 0.03 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().priceUsd).toBe(0.03);
    });

    it('configures payment', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/payment`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { payoutWalletAddress: WALLET_A },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().payoutWalletAddress).toBe(WALLET_A);
    });

    it('publishes once every requirement is met', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/v1/listings/${listingId}/publish`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('published');
    });

    it('refuses to publish the same listing twice', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/v1/listings/${listingId}/publish`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(409);
    });

    it('appears in the public marketplace feed, tagged as third-party', async () => {
      const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
      expect(res.statusCode).toBe(200);
      const listing = res.json().apis.find((a: { slug: string }) => a.slug === 'chainscan-wallet-risk-test');
      expect(listing).toBeDefined();
      expect(listing.isThirdParty).toBe(true);
      expect(listing.providerName).toBe('Pipeline Provider');
      expect(listing.priceUsd).toBe(0.03);
    });

    it('hides another provider\'s listing behind a 404, not a 403 — ownership is never leaked', async () => {
      const otherRegister = await server.inject({
        method: 'POST',
        url: '/v1/providers/register',
        payload: { name: 'Other Provider', email: 'other@ledgerwatch.test', walletAddress: WALLET_B },
      });
      const otherKey = otherRegister.json().apiKey;

      const res = await server.inject({
        method: 'GET',
        url: `/v1/listings/${listingId}`,
        headers: { authorization: `Bearer ${otherKey}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rotates the API key and invalidates the old one', async () => {
      const rotate = await server.inject({
        method: 'POST',
        url: '/v1/providers/api-key/rotate',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(rotate.statusCode).toBe(200);
      const newKey = rotate.json().apiKey;
      expect(newKey).not.toBe(apiKey);

      const withOldKey = await server.inject({
        method: 'GET',
        url: '/v1/providers/me',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(withOldKey.statusCode).toBe(401);

      const withNewKey = await server.inject({
        method: 'GET',
        url: '/v1/providers/me',
        headers: { authorization: `Bearer ${newKey}` },
      });
      expect(withNewKey.statusCode).toBe(200);
    });
  });
});
