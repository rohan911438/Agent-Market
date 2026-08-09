import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

async function publishListing(server: FastifyInstance, opts: { email: string; wallet: string; slug: string }): Promise<{ listingId: string }> {
  const register = await server.inject({
    method: 'POST',
    url: '/v1/providers/register',
    payload: { name: `Availability Test ${opts.slug}`, email: opts.email, walletAddress: opts.wallet },
  });
  const apiKey = register.json().apiKey;
  await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });

  const create = await server.inject({
    method: 'POST',
    url: '/v1/listings',
    headers: { authorization: `Bearer ${apiKey}` },
    payload: {
      slug: opts.slug,
      name: `Availability Fixture ${opts.slug}`,
      description: 'Fixture listing for the availability score test.',
      category: 'Test',
      upstreamUrl: `https://api.example.com/${opts.slug}`,
    },
  });
  const listingId = create.json().id;

  await server.inject({
    method: 'PATCH',
    url: `/v1/listings/${listingId}/pricing`,
    headers: { authorization: `Bearer ${apiKey}` },
    payload: { pricingModel: 'pay_per_call', priceUsd: 0.03 },
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

describe('availability score (Phase 13) via GET /v1/marketplace', () => {
  let server: FastifyInstance;
  const ctx = buildTestContext();

  beforeAll(async () => {
    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('is null (no data yet) for a listing with no requests and no synthetic checks', async () => {
    const { listingId } = await publishListing(server, { email: 'availability-no-data@ledgerwatch.test', wallet: 'S'.repeat(58), slug: 'availability-no-data' });

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);
    expect(listing.availabilityPct).toBeNull();
  });

  it('computes the exact expected percentage from a known mix of real ApiRequest successes and failures', async () => {
    const { listingId } = await publishListing(server, { email: 'availability-known-mix@ledgerwatch.test', wallet: 'T'.repeat(58), slug: 'availability-known-mix' });

    const now = new Date();
    const statusCodes = [200, 200, 200, 200, 200, 200, 200, 200, 500, 503]; // 8 of 10 available -> 80%
    await Promise.all(
      statusCodes.map((statusCode, i) =>
        ctx.db.prisma.apiRequest.create({
          data: {
            requestId: `availability-mix-${listingId}-${i}`,
            route: 'availability-fixture',
            method: 'GET',
            ipAddress: '127.0.0.1',
            statusCode,
            latencyMs: 100,
            cacheHit: false,
            listingId,
            createdAt: now,
          },
        }),
      ),
    );

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);
    expect(listing.availabilityPct).toBe(80);
  });

  it('excludes requests outside the 90-day rolling window', async () => {
    const { listingId } = await publishListing(server, { email: 'availability-old-data@ledgerwatch.test', wallet: 'U'.repeat(58), slug: 'availability-old-data' });

    const now = new Date();
    const ninetyOneDaysAgo = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);

    // All-failure, but entirely outside the window -> must not count at all (null, not 0%).
    await Promise.all(
      [500, 500, 500].map((statusCode, i) =>
        ctx.db.prisma.apiRequest.create({
          data: {
            requestId: `availability-old-${listingId}-${i}`,
            route: 'availability-fixture-old',
            method: 'GET',
            ipAddress: '127.0.0.1',
            statusCode,
            latencyMs: 100,
            cacheHit: false,
            listingId,
            createdAt: ninetyOneDaysAgo,
          },
        }),
      ),
    );

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);
    expect(listing.availabilityPct).toBeNull();
  });

  it('blends real ApiRequest data with synthetic-check data into one figure', async () => {
    const { listingId } = await publishListing(server, { email: 'availability-blended@ledgerwatch.test', wallet: 'V'.repeat(58), slug: 'availability-blended' });
    const now = new Date();

    // 3 successful real requests...
    await Promise.all(
      [200, 200, 200].map((statusCode, i) =>
        ctx.db.prisma.apiRequest.create({
          data: {
            requestId: `availability-blend-req-${listingId}-${i}`,
            route: 'availability-fixture-blend',
            method: 'GET',
            ipAddress: '127.0.0.1',
            statusCode,
            latencyMs: 100,
            cacheHit: false,
            listingId,
            createdAt: now,
          },
        }),
      ),
    );
    // ...plus 1 failed synthetic check -> 3 of 4 total -> 75%.
    await ctx.db.syntheticChecks.record({ target: listingId, targetType: 'third_party', success: false, latencyMs: 50, statusCode: 500 });

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === listingId);
    expect(listing.availabilityPct).toBe(75);
  });

  it('computes availability for a first-party endpoint by route, shared across the fixed "first-party" synthetic target', async () => {
    const firstParty = await ctx.db.prisma.marketplaceApi.create({
      data: {
        slug: 'availability-first-party-fixture',
        name: 'Availability First-Party Fixture',
        description: 'Fixture first-party endpoint for the availability score test.',
        category: 'Test',
        priceUsd: 0.01,
        endpoint: '/v1/availability-fixture-endpoint',
        status: 'live',
      },
    });
    const now = new Date();
    await Promise.all(
      [200, 200, 200, 500].map((statusCode, i) =>
        ctx.db.prisma.apiRequest.create({
          data: {
            requestId: `availability-fp-${i}`,
            route: firstParty.endpoint,
            method: 'GET',
            ipAddress: '127.0.0.1',
            statusCode,
            latencyMs: 100,
            cacheHit: false,
            createdAt: now,
          },
        }),
      ),
    );

    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    const listing = res.json().apis.find((a: { id: string }) => a.id === firstParty.id);
    expect(listing.availabilityPct).toBe(75);
  });
});
