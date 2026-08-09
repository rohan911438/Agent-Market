import { describe, expect, it } from 'vitest';
import {
  bucketRequestMetrics,
  bucketUnitForRange,
  computePaymentSuccessRate,
  percentile,
  rangeSince,
  summarizeRequests,
  topCustomerCounts,
  topListingCounts,
  type RequestMetricInput,
} from './analytics.js';

describe('bucketUnitForRange / rangeSince', () => {
  it('buckets 24h ranges hourly and 7d/30d ranges daily', () => {
    expect(bucketUnitForRange('24h')).toBe('hour');
    expect(bucketUnitForRange('7d')).toBe('day');
    expect(bucketUnitForRange('30d')).toBe('day');
  });

  it('computes since as now minus the range window', () => {
    const now = new Date('2026-08-09T12:00:00.000Z');
    expect(rangeSince('24h', now).toISOString()).toBe('2026-08-08T12:00:00.000Z');
    expect(rangeSince('7d', now).toISOString()).toBe('2026-08-02T12:00:00.000Z');
  });
});

describe('percentile', () => {
  it('computes p95 via nearest-rank', () => {
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
  });

  it('does not require pre-sorted input', () => {
    expect(percentile([50, 10, 40, 20, 30], 95)).toBe(50);
  });

  it('returns 0 for an empty array rather than NaN', () => {
    expect(percentile([], 95)).toBe(0);
  });

  it('handles a single value', () => {
    expect(percentile([42], 95)).toBe(42);
  });
});

function req(over: Partial<RequestMetricInput>): RequestMetricInput {
  return { createdAt: new Date('2026-08-09T10:00:00.000Z'), latencyMs: 100, statusCode: 200, cacheHit: false, ...over };
}

describe('summarizeRequests', () => {
  it('returns accurate zeros for no requests — not NaN', () => {
    const result = summarizeRequests([]);
    expect(result).toEqual({ requestCount: 0, avgLatencyMs: 0, p95LatencyMs: 0, errorRate: 0, cacheHitRate: 0 });
  });

  it('computes known numbers from a hand-constructed fixture', () => {
    const requests = [
      req({ latencyMs: 100, statusCode: 200, cacheHit: true }),
      req({ latencyMs: 200, statusCode: 200, cacheHit: false }),
      req({ latencyMs: 300, statusCode: 500, cacheHit: false }),
    ];
    const result = summarizeRequests(requests);
    expect(result.requestCount).toBe(3);
    expect(result.avgLatencyMs).toBe(200);
    expect(result.p95LatencyMs).toBe(300);
    expect(result.errorRate).toBeCloseTo(1 / 3, 10);
    expect(result.cacheHitRate).toBeCloseTo(1 / 3, 10);
  });

  it('treats any statusCode >= 400 as an error, 2xx/3xx as success', () => {
    const requests = [req({ statusCode: 200 }), req({ statusCode: 304 }), req({ statusCode: 402 }), req({ statusCode: 500 })];
    expect(summarizeRequests(requests).errorRate).toBeCloseTo(0.5, 10);
  });
});

describe('bucketRequestMetrics', () => {
  it('groups requests into UTC-hour buckets for the hourly unit', () => {
    const requests = [
      req({ createdAt: new Date('2026-08-09T10:05:00.000Z') }),
      req({ createdAt: new Date('2026-08-09T10:55:00.000Z') }),
      req({ createdAt: new Date('2026-08-09T11:05:00.000Z') }),
    ];
    const points = bucketRequestMetrics(requests, 'hour');
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ timestamp: '2026-08-09T10:00:00.000Z', requestCount: 2 });
    expect(points[1]).toMatchObject({ timestamp: '2026-08-09T11:00:00.000Z', requestCount: 1 });
  });

  it('groups requests into UTC-day buckets for the daily unit', () => {
    const requests = [
      req({ createdAt: new Date('2026-08-09T23:55:00.000Z') }),
      req({ createdAt: new Date('2026-08-10T00:05:00.000Z') }),
    ];
    const points = bucketRequestMetrics(requests, 'day');
    expect(points).toHaveLength(2);
    expect(points[0]?.timestamp).toBe('2026-08-09T00:00:00.000Z');
    expect(points[1]?.timestamp).toBe('2026-08-10T00:00:00.000Z');
  });

  it('returns points sorted chronologically regardless of input order', () => {
    const requests = [
      req({ createdAt: new Date('2026-08-09T12:00:00.000Z') }),
      req({ createdAt: new Date('2026-08-09T10:00:00.000Z') }),
      req({ createdAt: new Date('2026-08-09T11:00:00.000Z') }),
    ];
    const points = bucketRequestMetrics(requests, 'hour');
    expect(points.map((p) => p.timestamp)).toEqual([
      '2026-08-09T10:00:00.000Z',
      '2026-08-09T11:00:00.000Z',
      '2026-08-09T12:00:00.000Z',
    ]);
  });

  it('returns no points for no requests', () => {
    expect(bucketRequestMetrics([], 'hour')).toEqual([]);
  });
});

describe('computePaymentSuccessRate', () => {
  it('returns an accurate zero (not NaN) with attemptCount 0 when there have been no attempts', () => {
    expect(computePaymentSuccessRate([])).toEqual({ rate: 0, attemptCount: 0 });
  });

  it('computes the rate over attempts, not over an unrelated request volume', () => {
    // 100 requests happened (elsewhere), but only these 4 are real payment attempts.
    const attempts = [{ status: 'SETTLED' }, { status: 'SETTLED' }, { status: 'SETTLED' }, { status: 'FAILED' }];
    const result = computePaymentSuccessRate(attempts);
    expect(result.attemptCount).toBe(4);
    expect(result.rate).toBeCloseTo(0.75, 10);
    // If this were (mistakenly) computed against 100 requests instead of 4 attempts, it would be 0.03 — assert it isn't.
    expect(result.rate).not.toBeCloseTo(3 / 100, 10);
  });

  it('is 0 for an all-failed record, not negative or NaN', () => {
    expect(computePaymentSuccessRate([{ status: 'FAILED' }, { status: 'FAILED' }])).toEqual({ rate: 0, attemptCount: 2 });
  });

  it('is 1 for an all-settled record', () => {
    expect(computePaymentSuccessRate([{ status: 'SETTLED' }, { status: 'SETTLED' }])).toEqual({ rate: 1, attemptCount: 2 });
  });
});

describe('topListingCounts', () => {
  it('groups and sorts by request count descending', () => {
    const requests = [{ listingId: 'a' }, { listingId: 'b' }, { listingId: 'a' }, { listingId: 'a' }, { listingId: 'b' }];
    expect(topListingCounts(requests)).toEqual([
      { listingId: 'a', requestCount: 3 },
      { listingId: 'b', requestCount: 2 },
    ]);
  });

  it('returns an empty array for no requests', () => {
    expect(topListingCounts([])).toEqual([]);
  });
});

describe('topCustomerCounts', () => {
  it('groups and sorts by request count descending, excluding anonymous requests', () => {
    const requests = [
      { walletAddress: 'WALLET_A' },
      { walletAddress: null },
      { walletAddress: 'WALLET_B' },
      { walletAddress: 'WALLET_A' },
    ];
    expect(topCustomerCounts(requests)).toEqual([
      { walletAddress: 'WALLET_A', requestCount: 2 },
      { walletAddress: 'WALLET_B', requestCount: 1 },
    ]);
  });

  it('caps results at the given limit', () => {
    const requests = Array.from({ length: 15 }, (_, i) => ({ walletAddress: `WALLET_${i}` }));
    expect(topCustomerCounts(requests, 10)).toHaveLength(10);
  });
});
