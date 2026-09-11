/**
 * Pure aggregation for the provider analytics dashboard (Phase 9). All I/O
 * (querying ApiRequest/Payment rows) happens in the route; every function
 * here takes plain arrays already in memory, so the aggregation math is
 * unit-testable without a database — same discipline as trust-score.ts.
 */

export type AnalyticsRange = '24h' | '7d' | '30d';
export type BucketUnit = 'hour' | 'day';

const RANGE_MS: Record<AnalyticsRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/** Hourly buckets for the 24h range, daily buckets for the 7d/30d ranges — picked once, documented here, not left for the caller to guess. */
export function bucketUnitForRange(range: AnalyticsRange): BucketUnit {
  return range === '24h' ? 'hour' : 'day';
}

export function rangeSince(range: AnalyticsRange, now: Date = new Date()): Date {
  return new Date(now.getTime() - RANGE_MS[range]);
}

/**
 * Nearest-rank percentile (not interpolated) — the standard, simplest
 * definition, adequate for a v1 dashboard. `values` need not be pre-sorted.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

export interface RequestMetricInput {
  createdAt: Date;
  latencyMs: number;
  statusCode: number;
  cacheHit: boolean;
}

export interface RequestMetricSummary {
  requestCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  /** 0 when requestCount is 0 — an accurate zero, not NaN. */
  errorRate: number;
  cacheHitRate: number;
}

export function summarizeRequests(requests: RequestMetricInput[]): RequestMetricSummary {
  if (requests.length === 0) {
    return { requestCount: 0, avgLatencyMs: 0, p95LatencyMs: 0, errorRate: 0, cacheHitRate: 0 };
  }
  const latencies = requests.map((r) => r.latencyMs);
  const errorCount = requests.filter((r) => r.statusCode >= 400).length;
  const cacheHitCount = requests.filter((r) => r.cacheHit).length;
  return {
    requestCount: requests.length,
    avgLatencyMs: Math.round(latencies.reduce((sum, v) => sum + v, 0) / requests.length),
    p95LatencyMs: percentile(latencies, 95),
    errorRate: errorCount / requests.length,
    cacheHitRate: cacheHitCount / requests.length,
  };
}

export interface AnalyticsBucketPoint extends RequestMetricSummary {
  /** ISO timestamp of the UTC bucket start. */
  timestamp: string;
}

function bucketStart(date: Date, unit: BucketUnit): string {
  return unit === 'hour'
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())).toISOString()
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

/** Groups requests into UTC-aligned buckets and summarizes each — chronologically sorted, empty buckets omitted (nothing to show, not a fabricated zero row). */
export function bucketRequestMetrics(requests: RequestMetricInput[], unit: BucketUnit): AnalyticsBucketPoint[] {
  const groups = new Map<string, RequestMetricInput[]>();
  for (const request of requests) {
    const key = bucketStart(request.createdAt, unit);
    const group = groups.get(key);
    if (group) group.push(request);
    else groups.set(key, [request]);
  }
  return Array.from(groups.entries())
    .map(([timestamp, rows]) => ({ timestamp, ...summarizeRequests(rows) }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export interface PaymentAttemptInput {
  status: string;
}

export interface PaymentSuccessSummary {
  /** Successful settlements over total *attempts* (settled + failed) — never over raw request volume, which would conflate free 402 probes with real attempts. 0 when there have been no attempts. */
  rate: number;
  attemptCount: number;
}

export function computePaymentSuccessRate(attempts: PaymentAttemptInput[]): PaymentSuccessSummary {
  if (attempts.length === 0) return { rate: 0, attemptCount: 0 };
  const settled = attempts.filter((a) => a.status === 'SETTLED').length;
  return { rate: settled / attempts.length, attemptCount: attempts.length };
}

export interface TopListingInput {
  listingId: string;
}

export interface TopListingCount {
  listingId: string;
  requestCount: number;
}

/** Descending by request count. Only meaningful once a provider has more than one listing — a single-listing provider gets a one-row list, which is fine. */
export function topListingCounts(requests: TopListingInput[]): TopListingCount[] {
  const counts = new Map<string, number>();
  for (const r of requests) counts.set(r.listingId, (counts.get(r.listingId) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([listingId, requestCount]) => ({ listingId, requestCount }))
    .sort((a, b) => b.requestCount - a.requestCount);
}

export interface TopCustomerInput {
  walletAddress: string | null;
}

export interface TopCustomerCount {
  walletAddress: string;
  requestCount: number;
}

/** Descending by request count, top `limit` only. Anonymous (no wallet) requests are excluded — there's no customer identity to attribute them to. */
export function topCustomerCounts(requests: TopCustomerInput[], limit = 10): TopCustomerCount[] {
  const counts = new Map<string, number>();
  for (const r of requests) {
    if (!r.walletAddress) continue;
    counts.set(r.walletAddress, (counts.get(r.walletAddress) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([walletAddress, requestCount]) => ({ walletAddress, requestCount }))
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, limit);
}
