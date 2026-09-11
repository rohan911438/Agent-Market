import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

const ADMIN_KEY = 'test-admin-api-key'; // must match buildTestConfig's security.adminApiKey
const WALLET = 'J'.repeat(58);

async function publishListing(
  server: FastifyInstance,
  opts: { email: string; wallet: string; slug: string; pricingModel?: 'pay_per_call' | 'subscription' | 'bundle'; priceUsd?: number },
): Promise<{ apiKey: string; providerId: string; listingId: string }> {
  const register = await server.inject({
    method: 'POST',
    url: '/v1/providers/register',
    payload: { name: `Storefront Test ${opts.slug}`, email: opts.email, walletAddress: opts.wallet },
  });
  const apiKey = register.json().apiKey;
  const providerId = register.json().providerId;

  await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });

  const create = await server.inject({
    method: 'POST',
    url: '/v1/listings',
    headers: { authorization: `Bearer ${apiKey}` },
    payload: {
      slug: opts.slug,
      name: `Storefront Fixture ${opts.slug}`,
      description: 'Fixture listing for the marketplace storefront test.',
      category: 'Test',
      upstreamUrl: `https://api.example.com/${opts.slug}`,
    },
  });
  const listingId = create.json().id;

  await server.inject({
    method: 'PATCH',
    url: `/v1/listings/${listingId}/pricing`,
    headers: { authorization: `Bearer ${apiKey}` },
    payload: { pricingModel: opts.pricingModel ?? 'pay_per_call', priceUsd: opts.priceUsd ?? 0.03 },
  });
  await server.inject({
    method: 'PATCH',
    url: `/v1/listings/${listingId}/payment`,
    headers: { authorization: `Bearer ${apiKey}` },
    payload: { payoutWalletAddress: opts.wallet },
  });
  await server.inject({ method: 'POST', url: `/v1/listings/${listingId}/publish`, headers: { authorization: `Bearer ${apiKey}` } });

  return { apiKey, providerId, listingId };
}

describe('marketplace storefront (Phase 10)', () => {
  let server: FastifyInstance;
  const ctx = buildTestContext();

  beforeAll(async () => {
    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns a well-formed response with apis and collections even with nothing curated', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.apis)).toBe(true);
    expect(Array.isArray(body.collections)).toBe(true);
  });

  it('marks a freshly-published listing as isNew, with an honest zero rating', async () => {
    const { listingId } = await publishListing(server, { email: 'storefront-new@ledgerwatch.test', wallet: WALLET, slug: 'storefront-new-listing' });

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);

    expect(listing).toBeDefined();
    expect(listing.isNew).toBe(true);
    expect(listing.avgRating).toBeNull();
    expect(listing.reviewCount).toBe(0);
  });

  it('does not mark a listing published more than 14 days ago as isNew', async () => {
    const { listingId } = await publishListing(server, {
      email: 'storefront-old@ledgerwatch.test',
      wallet: 'K'.repeat(58),
      slug: 'storefront-old-listing',
    });

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    await ctx.db.prisma.apiListing.update({ where: { id: listingId }, data: { publishedAt: fifteenDaysAgo } });

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);
    expect(listing.isNew).toBe(false);
  });

  it('displays a subscription-priced listing with the /month unit, not the misleading /call', async () => {
    const { listingId } = await publishListing(server, {
      email: 'storefront-sub@ledgerwatch.test',
      wallet: 'L'.repeat(58),
      slug: 'storefront-subscription-listing',
      pricingModel: 'subscription',
      priceUsd: 9.99,
    });

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);
    expect(listing.pricingModel).toBe('subscription');
    expect(listing.priceLabel).toBe('$9.99 / month');
  });

  it('computes callCount7d from real ApiRequest rows and excludes traffic outside the 7-day window', async () => {
    const { listingId } = await publishListing(server, {
      email: 'storefront-trending@ledgerwatch.test',
      wallet: 'M'.repeat(58),
      slug: 'storefront-trending-listing',
    });

    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 3; i++) {
      await ctx.db.prisma.apiRequest.create({
        data: {
          requestId: `storefront-trending-in-range-${i}`,
          route: 'storefront-trending-listing',
          method: 'GET',
          ipAddress: '127.0.0.1',
          statusCode: 200,
          latencyMs: 100,
          cacheHit: false,
          listingId,
          createdAt: now,
        },
      });
    }
    // Outside the 7-day window — must not count.
    await ctx.db.prisma.apiRequest.create({
      data: {
        requestId: 'storefront-trending-out-of-range',
        route: 'storefront-trending-listing',
        method: 'GET',
        ipAddress: '127.0.0.1',
        statusCode: 200,
        latencyMs: 100,
        cacheHit: false,
        listingId,
        createdAt: eightDaysAgo,
      },
    });

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);
    expect(listing.callCount7d).toBe(3);
  });

  it('resolves a curated collection against the live catalog and silently skips a dangling id', async () => {
    const { listingId } = await publishListing(server, {
      email: 'storefront-collection@ledgerwatch.test',
      wallet: 'N'.repeat(58),
      slug: 'storefront-collection-listing',
    });

    const upsert = await server.inject({
      method: 'POST',
      url: '/v1/admin/collections',
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
      payload: {
        slug: 'storefront-test-collection',
        name: 'Storefront Test Collection',
        description: 'A fixture collection for the storefront test.',
        listingIds: [listingId, 'this-id-does-not-exist-anywhere'],
      },
    });
    expect(upsert.statusCode).toBe(200);

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const collection = res.json().collections.find((c: { slug: string }) => c.slug === 'storefront-test-collection');

    expect(collection).toBeDefined();
    expect(collection.listings).toHaveLength(1);
    expect(collection.listings[0].id).toBe(listingId);
  });

  it('rejects the collections admin endpoint with no admin auth', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/admin/collections',
      payload: { slug: 'unauthorized-test', name: 'x', description: 'x', listingIds: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});
