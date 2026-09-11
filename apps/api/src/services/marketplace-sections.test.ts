import { describe, expect, it } from 'vitest';
import { formatPriceLabel, isRecentlyPublished } from './marketplace-sections.js';

describe('isRecentlyPublished', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');

  it('is false for a null date — never published is never "new"', () => {
    expect(isRecentlyPublished(null, now)).toBe(false);
  });

  it('is true for a date published right now', () => {
    expect(isRecentlyPublished(now, now)).toBe(true);
  });

  it('is true for a date within the 14-day window', () => {
    expect(isRecentlyPublished(new Date('2026-08-01T12:00:00.000Z'), now)).toBe(true); // exactly 8 days ago
    expect(isRecentlyPublished(new Date('2026-07-26T12:00:00.000Z'), now)).toBe(true); // exactly 14 days ago
  });

  it('is false just outside the 14-day window', () => {
    expect(isRecentlyPublished(new Date('2026-07-26T11:59:59.000Z'), now)).toBe(false); // 14 days + 1s ago
    expect(isRecentlyPublished(new Date('2026-01-01T00:00:00.000Z'), now)).toBe(false);
  });

  it('respects a custom window', () => {
    const eightDaysAgo = new Date('2026-08-01T12:00:00.000Z');
    expect(isRecentlyPublished(eightDaysAgo, now, 7)).toBe(false);
    expect(isRecentlyPublished(eightDaysAgo, now, 9)).toBe(true);
  });

  it('is false for a future date rather than treating it as maximally new', () => {
    expect(isRecentlyPublished(new Date('2026-08-10T00:00:00.000Z'), now)).toBe(false);
  });
});

describe('formatPriceLabel', () => {
  it('labels pay_per_call as "$X / call"', () => {
    expect(formatPriceLabel(0.05, 'pay_per_call')).toBe('$0.05 / call');
  });

  it('labels a subscription-priced listing as "$X / month" — not the misleading "/ call"', () => {
    expect(formatPriceLabel(9.99, 'subscription')).toBe('$9.99 / month');
  });

  it('labels a bundle-priced listing as one-time, not recurring', () => {
    expect(formatPriceLabel(4.99, 'bundle')).toBe('$4.99 one-time');
  });

  it('falls back to "/ call" for an unrecognized pricing model rather than throwing', () => {
    expect(formatPriceLabel(1, 'something_else')).toBe('$1.00 / call');
  });

  it('formats to exactly two decimal places', () => {
    expect(formatPriceLabel(0.1, 'pay_per_call')).toBe('$0.10 / call');
    expect(formatPriceLabel(5, 'subscription')).toBe('$5.00 / month');
  });
});
