import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

const WALLET = 'C'.repeat(58);

describe('provider revenue ledger', () => {
  let server: FastifyInstance;
  const ctx = buildTestContext();

  beforeAll(async () => {
    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('shows a correctly-rendered zero state for a provider with no traffic — not an error or a blank screen', async () => {
    const register = await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'No Traffic Yet', email: 'no-traffic@ledgerwatch.test', walletAddress: WALLET },
    });
    const apiKey = register.json().apiKey;

    const res = await server.inject({
      method: 'GET',
      url: '/v1/providers/me/revenue',
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ totalEarnedUsd: 0, thisMonthUsd: 0, listings: [], recentPayouts: [] });
  });

  it('rejects revenue requests with no provider auth', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/providers/me/revenue' });
    expect(res.statusCode).toBe(401);
  });

  describe('a provider with settled traffic against its own listings', () => {
    let apiKey: string;
    let providerId: string;
    let listingAId: string;
    let listingBId: string;

    beforeAll(async () => {
      const register = await server.inject({
        method: 'POST',
        url: '/v1/providers/register',
        payload: { name: 'Ledgerwatch Revenue Test', email: 'revenue@ledgerwatch.test', walletAddress: 'D'.repeat(58) },
      });
      apiKey = register.json().apiKey;
      providerId = register.json().providerId;

      // Listings are inserted directly (bypassing the publish pipeline,
      // already covered by control-plane.integration.test.ts) since the
      // revenue ledger only cares that a listing with a payoutSplitBps
      // exists, not its publish status.
      const listingA = await ctx.db.prisma.apiListing.create({
        data: {
          providerAccountId: providerId,
          slug: 'revenue-listing-a',
          name: 'Revenue Listing A',
          description: 'Fixture listing for the revenue ledger test.',
          category: 'Test',
          upstreamUrl: 'https://api.example.com/a',
          payoutSplitBps: 8000, // 80% to the provider
        },
      });
      listingAId = listingA.id;

      const listingB = await ctx.db.prisma.apiListing.create({
        data: {
          providerAccountId: providerId,
          slug: 'revenue-listing-b',
          name: 'Revenue Listing B',
          description: 'Fixture listing for the revenue ledger test.',
          category: 'Test',
          upstreamUrl: 'https://api.example.com/b',
          payoutSplitBps: 5000, // 50% to the provider
        },
      });
      listingBId = listingB.id;

      const now = new Date();
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const lastMonth = new Date(monthStart - 1); // guaranteed to fall in the prior UTC calendar month

      // Two settled payments against listing A this month -> should aggregate into one breakdown row.
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'revenue-test-a-1',
          resource: 'revenue-listing-a',
          amountAtomic: '1000000', // $1.00
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'SETTLED',
          settledAt: now,
          listingId: listingAId,
        },
      });
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'revenue-test-a-2',
          resource: 'revenue-listing-a',
          amountAtomic: '2000000', // $2.00
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'SETTLED',
          settledAt: now,
          listingId: listingAId,
        },
      });

      // One settled payment against listing B, settled last month -> counts toward the
      // lifetime total but must be excluded from "this month".
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'revenue-test-b-1',
          resource: 'revenue-listing-b',
          amountAtomic: '4000000', // $4.00
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'SETTLED',
          settledAt: lastMonth,
          listingId: listingBId,
        },
      });

      // An unsettled payment against listing A -> must never be counted.
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'revenue-test-a-pending',
          resource: 'revenue-listing-a',
          amountAtomic: '9000000', // $9.00 — would blow every assertion below if this leaked in
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'PENDING',
          listingId: listingAId,
        },
      });

      // A settled first-party payment (no listingId) -> not provider revenue, must never be counted.
      await ctx.db.prisma.payment.create({
        data: {
          paymentRef: 'revenue-test-first-party',
          resource: '/v1/analyze',
          amountAtomic: '5000000',
          asset: 'USDC',
          network: 'algorand-testnet',
          scheme: 'exact',
          status: 'SETTLED',
          settledAt: now,
        },
      });
    });

    it('computes the correctly take-rated total, this-month total, and per-listing breakdown', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/providers/me/revenue',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // (1 + 2) * 0.8 + 4 * 0.5 = 2.4 + 2.0 = 4.4
      expect(body.totalEarnedUsd).toBeCloseTo(4.4, 10);
      // Only the two payments settled this month: (1 + 2) * 0.8 = 2.4
      expect(body.thisMonthUsd).toBeCloseTo(2.4, 10);

      expect(body.listings).toHaveLength(2);
      const listingA = body.listings.find((l: { listingId: string }) => l.listingId === listingAId);
      const listingB = body.listings.find((l: { listingId: string }) => l.listingId === listingBId);

      expect(listingA.paymentCount).toBe(2);
      expect(listingA.totalUsd).toBeCloseTo(2.4, 10);
      expect(listingB.paymentCount).toBe(1);
      expect(listingB.totalUsd).toBeCloseTo(2.0, 10);
    });
  });
});
