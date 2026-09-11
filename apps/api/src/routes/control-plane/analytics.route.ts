import { AnalyticsQuerySchema, type AnalyticsSummaryView } from '@rohankumar4179/shared-types';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { createProviderAuthPreHandler } from '../../middleware/provider-auth.js';
import {
  bucketRequestMetrics,
  bucketUnitForRange,
  computePaymentSuccessRate,
  rangeSince,
  summarizeRequests,
  topCustomerCounts,
  topListingCounts,
} from '../../services/analytics.js';

/**
 * The provider-facing operational dashboard (Phase 9) — usage, latency,
 * error rate, cache hit rate, and payment success rate for a provider's own
 * listings, computed directly from ApiRequest/Payment rows (no
 * pre-aggregated rollup table — not justified at this data volume). Reuses
 * the exact `listingId` column Phase 7 added for revenue attribution.
 */
export function registerProviderAnalyticsRoutes(server: FastifyInstance, ctx: AppContext): void {
  const requireProviderAuth = createProviderAuthPreHandler(ctx);

  server.get('/v1/providers/me/analytics', { preHandler: requireProviderAuth }, async (request) => {
    const account = request.providerAccount!;
    const { range, listingId } = AnalyticsQuerySchema.parse(request.query);

    const since = rangeSince(range);
    const bucket = bucketUnitForRange(range);

    const [requests, attempts, listings] = await Promise.all([
      ctx.db.apiRequests.findForProvider(account.id, since, listingId),
      ctx.db.payments.findAttemptsForProvider(account.id, since, listingId),
      ctx.db.apiListings.listByProvider(account.id),
    ]);

    const listingById = new Map(listings.map((l) => [l.id, l]));
    const payment = computePaymentSuccessRate(attempts);

    const summary: AnalyticsSummaryView = {
      range,
      bucket,
      totals: {
        ...summarizeRequests(requests),
        paymentSuccessRate: payment.rate,
        paymentAttemptCount: payment.attemptCount,
      },
      points: bucketRequestMetrics(requests, bucket),
      // findForProvider's `listing: { providerAccountId }` filter guarantees listingId is
      // never null on any returned row — Prisma's static types just don't know that.
      topListings: topListingCounts(requests.map((r) => ({ listingId: r.listingId as string }))).map((t) => ({
        listingId: t.listingId,
        slug: listingById.get(t.listingId)?.slug ?? 'unknown',
        name: listingById.get(t.listingId)?.name ?? 'unknown',
        requestCount: t.requestCount,
      })),
      topCustomers: topCustomerCounts(requests.map((r) => ({ walletAddress: r.wallet?.address ?? null }))),
    };

    return summary;
  });
}
