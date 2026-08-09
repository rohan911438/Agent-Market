import { z } from 'zod';

export const AnalyticsRangeSchema = z.enum(['24h', '7d', '30d']);
export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;

export const AnalyticsBucketUnitSchema = z.enum(['hour', 'day']);
export type AnalyticsBucketUnit = z.infer<typeof AnalyticsBucketUnitSchema>;

export const AnalyticsQuerySchema = z.object({
  range: AnalyticsRangeSchema.default('24h'),
  listingId: z.string().trim().min(1).optional(),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

export const AnalyticsBucketPointSchema = z.object({
  timestamp: z.string().datetime(),
  requestCount: z.number().int().nonnegative(),
  avgLatencyMs: z.number().nonnegative(),
  p95LatencyMs: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  cacheHitRate: z.number().min(0).max(1),
});
export type AnalyticsBucketPoint = z.infer<typeof AnalyticsBucketPointSchema>;

export const AnalyticsTotalsSchema = z.object({
  requestCount: z.number().int().nonnegative(),
  avgLatencyMs: z.number().nonnegative(),
  p95LatencyMs: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  cacheHitRate: z.number().min(0).max(1),
  /** Settled / (settled + failed) payment attempts — never over raw request volume. See services/analytics.ts. */
  paymentSuccessRate: z.number().min(0).max(1),
  paymentAttemptCount: z.number().int().nonnegative(),
});
export type AnalyticsTotals = z.infer<typeof AnalyticsTotalsSchema>;

export const TopListingSchema = z.object({
  listingId: z.string(),
  slug: z.string(),
  name: z.string(),
  requestCount: z.number().int().nonnegative(),
});
export type TopListing = z.infer<typeof TopListingSchema>;

export const TopCustomerSchema = z.object({
  walletAddress: z.string(),
  requestCount: z.number().int().nonnegative(),
});
export type TopCustomer = z.infer<typeof TopCustomerSchema>;

/**
 * Response shape for GET /v1/providers/me/analytics. Same honesty rule as
 * the revenue ledger (Phase 07): third-party listings have no real traffic
 * until the gateway exists, so a provider with no calls sees accurate zeros
 * (requestCount 0, every rate 0) here, never an error or a fabricated
 * sample. `bucket` tells the caller how to interpret `points` — 'hour' for
 * the 24h range, 'day' for 7d/30d.
 */
export const AnalyticsSummaryViewSchema = z.object({
  range: AnalyticsRangeSchema,
  bucket: AnalyticsBucketUnitSchema,
  totals: AnalyticsTotalsSchema,
  points: z.array(AnalyticsBucketPointSchema),
  topListings: z.array(TopListingSchema),
  topCustomers: z.array(TopCustomerSchema),
});
export type AnalyticsSummaryView = z.infer<typeof AnalyticsSummaryViewSchema>;
