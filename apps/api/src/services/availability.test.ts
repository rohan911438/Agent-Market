import { describe, expect, it } from 'vitest';
import { availabilityWindowStart, combineAvailabilityCounts, computeAvailabilityPct } from './availability.js';

describe('computeAvailabilityPct', () => {
  it('returns null (no data) when there have been zero checks — never a fabricated percentage', () => {
    expect(computeAvailabilityPct({ total: 0, successful: 0 })).toBeNull();
  });

  it('computes 100% when every check succeeded', () => {
    expect(computeAvailabilityPct({ total: 10, successful: 10 })).toBe(100);
  });

  it('computes 0% when every check failed', () => {
    expect(computeAvailabilityPct({ total: 10, successful: 0 })).toBe(0);
  });

  it('computes the exact expected percentage from a known mix, not just "some number"', () => {
    // 37 of 40 successful -> 92.5%
    expect(computeAvailabilityPct({ total: 40, successful: 37 })).toBe(92.5);
  });

  it('rounds to 2 decimal places', () => {
    // 1 of 3 -> 33.333...% -> 33.33
    expect(computeAvailabilityPct({ total: 3, successful: 1 })).toBe(33.33);
  });
});

describe('combineAvailabilityCounts', () => {
  it('sums total and successful across two sources', () => {
    expect(combineAvailabilityCounts({ total: 10, successful: 8 }, { total: 5, successful: 5 })).toEqual({ total: 15, successful: 13 });
  });

  it('is a no-op when one source has no data', () => {
    expect(combineAvailabilityCounts({ total: 10, successful: 9 }, { total: 0, successful: 0 })).toEqual({ total: 10, successful: 9 });
  });
});

describe('availabilityWindowStart', () => {
  it('is exactly 90 days before the given time', () => {
    const now = new Date('2026-08-09T12:00:00.000Z');
    expect(availabilityWindowStart(now).toISOString()).toBe('2026-05-11T12:00:00.000Z');
  });
});
