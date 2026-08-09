import { describe, expect, it } from 'vitest';
import { atomicToUsd, currentUtcMonthStart, providerShareFromAtomic, providerShareUsd } from './revenue.js';

describe('atomicToUsd', () => {
  it('converts 6-decimal atomic units to USD', () => {
    expect(atomicToUsd('1000000')).toBe(1);
    expect(atomicToUsd('30000')).toBe(0.03);
    expect(atomicToUsd('0')).toBe(0);
  });
});

describe('providerShareUsd', () => {
  it('computes the default 80% provider split correctly', () => {
    expect(providerShareUsd(1, 8000)).toBeCloseTo(0.8, 10);
  });

  it('is bps, not a raw percentage — 8000 means 80%, not 8000%', () => {
    expect(providerShareUsd(1, 8000)).not.toBe(8000);
    expect(providerShareUsd(1, 8000)).toBeLessThan(1);
  });

  it('returns the provider share, never the platform cut', () => {
    // A 6000 bps split means the provider gets 60%, the platform 40% — this
    // function must always return the former.
    const share = providerShareUsd(10, 6000);
    expect(share).toBeCloseTo(6, 10);
    expect(share).not.toBeCloseTo(4, 10);
  });

  it('handles the extremes of the bps range', () => {
    expect(providerShareUsd(10, 0)).toBe(0);
    expect(providerShareUsd(10, 10_000)).toBe(10);
  });
});

describe('providerShareFromAtomic', () => {
  it('combines atomic-to-USD conversion with the take-rate split', () => {
    // $0.03 payment at the default 8000bps (80%) split -> $0.024 to the provider.
    expect(providerShareFromAtomic('30000', 8000)).toBeCloseTo(0.024, 10);
  });
});

describe('currentUtcMonthStart', () => {
  it('returns midnight UTC on the 1st of the given date\'s UTC month', () => {
    const start = currentUtcMonthStart(new Date('2026-08-09T23:59:59.999Z'));
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('is not fooled by a local-timezone-adjacent date near a month boundary', () => {
    const start = currentUtcMonthStart(new Date('2026-09-01T00:00:00.001Z'));
    expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
