import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

describe('provider analytics', () => {
  let server: FastifyInstance;
  const ctx = buildTestContext();

  beforeAll(async () => {
    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('shows a zero state for a provider with no traffic — no error, no NaN', async () => {
    const register = await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'No Analytics Traffic', email: 'no-analytics-traffic@ledgerwatch.test', walletAddress: 'G'.repeat(58) },
    });
    const apiKey = register.json().apiKey;

    const res = await server.inject({ method: 'GET', url: '/v1/providers/me/analytics', headers: { authorization: `Bearer ${apiKey}` } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.range).toBe('24h');
    expect(body.bucket).toBe('hour');
    expect(body.totals).toEqual({
      requestCount: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      errorRate: 0,
      cacheHitRate: 0,
      paymentSuccessRate: 0,
      paymentAttemptCount: 0,
    });
    expect(body.points).toEqual([]);
    expect(body.topListings).toEqual([]);
    expect(body.topCustomers).toEqual([]);
  });

  it('rejects analytics requests with no provider auth', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/providers/me/analytics' });
    expect(res.statusCode).toBe(401);
  });

  describe('a provider with hand-constructed traffic', () => {
    let apiKey: string;
    let providerId: string;
    let listingId: string;
    let wallet1Address: string;
    let wallet2Address: string;

    beforeAll(async () => {
      const register = await server.inject({
        method: 'POST',
        url: '/v1/providers/register',
        payload: { name: 'Analytics Fixture Provider', email: 'analytics-fixture@ledgerwatch.test', walletAddress: 'H'.repeat(58) },
      });
      apiKey = register.json().apiKey;
      providerId = register.json().providerId;

      const listing = await ctx.db.prisma.apiListing.create({
        data: {
          providerAccountId: providerId,
          slug: 'analytics-fixture-listing',
          name: 'Analytics Fixture Listing',
          description: 'Fixture listing for the analytics aggregation test.',
          category: 'Test',
          upstreamUrl: 'https://api.example.com/analytics-fixture',
        },
      });
      listingId = listing.id;

      const wallet1 = await ctx.db.prisma.wallet.create({ data: { address: 'ANALYTICS_WALLET_1', network: 'algorand-testnet' } });
      const wallet2 = await ctx.db.prisma.wallet.create({ data: { address: 'ANALYTICS_WALLET_2', network: 'algorand-testnet' } });
      wallet1Address = wallet1.address;
      wallet2Address = wallet2.address;

      const now = new Date();
      const outsideRange = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h ago — outside the default 24h range

      // Three requests inside the range: latencies 100/300/500, one error, one cache hit.
      await ctx.db.prisma.apiRequest.create({
        data: {
          requestId: 'analytics-req-1',
          route: 'analytics-fixture-listing',
          method: 'GET',
          ipAddress: '127.0.0.1',
          statusCode: 200,
          latencyMs: 100,
          cacheHit: true,
          listingId,
          walletId: wallet1.id,
          createdAt: now,
        },
      });
      await ctx.db.prisma.apiRequest.create({
        data: {
          requestId: 'analytics-req-2',
          route: 'analytics-fixture-listing',
          method: 'GET',
          ipAddress: '127.0.0.1',
          statusCode: 200,
          latencyMs: 300,
          cacheHit: false,
          listingId,
          walletId: wallet1.id,
          createdAt: now,
        },
      });
      await ctx.db.prisma.apiRequest.create({
        data: {
          requestId: 'analytics-req-3',
          route: 'analytics-fixture-listing',
          method: 'GET',
          ipAddress: '127.0.0.1',
          statusCode: 500,
          latencyMs: 500,
          cacheHit: false,
          listingId,
          walletId: wallet2.id,
          createdAt: now,
        },
      });
      // Outside the default 24h range — must not affect totals.
      await ctx.db.prisma.apiRequest.create({
        data: {
          requestId: 'analytics-req-outside-range',
          route: 'analytics-fixture-listing',
          method: 'GET',
          ipAddress: '127.0.0.1',
          statusCode: 200,
          latencyMs: 9999,
          cacheHit: false,
          listingId,
          walletId: wallet1.id,
          createdAt: outsideRange,
        },
      });

      // Payment attempts: 1 settled, 1 failed, 1 still pending (must be excluded).
      // Deliberately fewer attempts than requests, so a bug that computes the
      // rate against request volume instead of attempts would be caught.
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'analytics-payment-settled',
          resource: 'analytics-fixture-listing',
          amountAtomic: '10000',
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'SETTLED',
          listingId,
          createdAt: now,
        },
      });
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'analytics-payment-failed',
          resource: 'analytics-fixture-listing',
          amountAtomic: '10000',
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'FAILED',
          listingId,
          createdAt: now,
        },
      });
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'analytics-payment-pending',
          resource: 'analytics-fixture-listing',
          amountAtomic: '10000',
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'PENDING',
          listingId,
          createdAt: now,
        },
      });
    });

    it('computes correctly-bucketed, correctly-computed totals from the fixture', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/providers/me/analytics',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.totals.requestCount).toBe(3);
      expect(body.totals.avgLatencyMs).toBe(300); // (100+300+500)/3
      expect(body.totals.p95LatencyMs).toBe(500); // nearest-rank p95 of [100,300,500]
      expect(body.totals.errorRate).toBeCloseTo(1 / 3, 10); // 1 of 3 requests was a 500
      expect(body.totals.cacheHitRate).toBeCloseTo(1 / 3, 10); // 1 of 3 requests was a cache hit
    });

    it('computes payment success rate against attempts, not request volume', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/providers/me/analytics',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      const body = res.json();
      // 1 settled of 2 resolved attempts (the pending one is excluded) -> 0.5,
      // not 1/3 or any ratio derived from the 3 requests.
      expect(body.totals.paymentAttemptCount).toBe(2);
      expect(body.totals.paymentSuccessRate).toBeCloseTo(0.5, 10);
    });

    it('excludes requests outside the requested range', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/providers/me/analytics',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const body = res.json();
      expect(body.totals.requestCount).toBe(3); // not 4 — the 25h-old request is excluded
    });

    it('reports top customers by request count, most active wallet first', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/providers/me/analytics',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const body = res.json();
      expect(body.topCustomers).toEqual([
        { walletAddress: wallet1Address, requestCount: 2 },
        { walletAddress: wallet2Address, requestCount: 1 },
      ]);
    });

    it('reports top listings with slug/name resolved', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/providers/me/analytics',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const body = res.json();
      expect(body.topListings).toEqual([{ listingId, slug: 'analytics-fixture-listing', name: 'Analytics Fixture Listing', requestCount: 3 }]);
    });

    it('scopes results to the requested listingId when provided', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/providers/me/analytics?listingId=${listingId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().totals.requestCount).toBe(3);
    });

    it('returns zero results for a listingId that does not belong to this provider', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/providers/me/analytics?listingId=not-mine',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().totals.requestCount).toBe(0);
    });
  });
});
