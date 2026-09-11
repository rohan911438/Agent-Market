import { describe, expect, it } from 'vitest';
import { computeTrustScore, computeVerificationTier, type TrustScoreInput } from './trust-score.js';

const NEUTRAL: TrustScoreInput = {
  accountAgeDays: 0,
  publishedListingCount: 0,
  publishAttempts: { published: 0, rejected: 0 },
  hasSuspendedListing: false,
};

describe('computeTrustScore', () => {
  it('scores a brand-new account with no history at zero — no evidence, no credit', () => {
    const result = computeTrustScore(NEUTRAL);
    expect(result.score).toBe(0);
    expect(result.breakdown).toEqual({
      accountAgePoints: 0,
      publishedListingsPoints: 0,
      publishSuccessRatePoints: 0,
      suspensionPenalty: 0,
    });
  });

  describe('account age alone', () => {
    it('awards +10 per 30 days', () => {
      expect(computeTrustScore({ ...NEUTRAL, accountAgeDays: 30 }).breakdown.accountAgePoints).toBe(10);
      expect(computeTrustScore({ ...NEUTRAL, accountAgeDays: 60 }).breakdown.accountAgePoints).toBe(20);
    });

    it('caps at 30 regardless of how old the account is', () => {
      expect(computeTrustScore({ ...NEUTRAL, accountAgeDays: 90 }).breakdown.accountAgePoints).toBe(30);
      expect(computeTrustScore({ ...NEUTRAL, accountAgeDays: 3650 }).breakdown.accountAgePoints).toBe(30);
    });

    it('does not award partial credit for a partial 30-day window', () => {
      expect(computeTrustScore({ ...NEUTRAL, accountAgeDays: 29 }).breakdown.accountAgePoints).toBe(0);
    });
  });

  describe('published listing count alone', () => {
    it('awards +5 per published listing', () => {
      expect(computeTrustScore({ ...NEUTRAL, publishedListingCount: 1 }).breakdown.publishedListingsPoints).toBe(5);
      expect(computeTrustScore({ ...NEUTRAL, publishedListingCount: 3 }).breakdown.publishedListingsPoints).toBe(15);
    });

    it('caps at 30 (6+ listings)', () => {
      expect(computeTrustScore({ ...NEUTRAL, publishedListingCount: 6 }).breakdown.publishedListingsPoints).toBe(30);
      expect(computeTrustScore({ ...NEUTRAL, publishedListingCount: 50 }).breakdown.publishedListingsPoints).toBe(30);
    });
  });

  describe('publish success rate alone', () => {
    it('awards the full 40 points for a perfect record', () => {
      const result = computeTrustScore({ ...NEUTRAL, publishAttempts: { published: 4, rejected: 0 } });
      expect(result.breakdown.publishSuccessRatePoints).toBe(40);
    });

    it('scales proportionally with a mixed record', () => {
      // 3 published, 1 rejected -> 75% -> 30 points
      const result = computeTrustScore({ ...NEUTRAL, publishAttempts: { published: 3, rejected: 1 } });
      expect(result.breakdown.publishSuccessRatePoints).toBe(30);
    });

    it('awards zero for an all-rejected record, not a negative number', () => {
      const result = computeTrustScore({ ...NEUTRAL, publishAttempts: { published: 0, rejected: 5 } });
      expect(result.breakdown.publishSuccessRatePoints).toBe(0);
    });

    it('awards zero (not a fabricated neutral score) when there have been no publish attempts at all', () => {
      const result = computeTrustScore({ ...NEUTRAL, publishAttempts: { published: 0, rejected: 0 } });
      expect(result.breakdown.publishSuccessRatePoints).toBe(0);
    });
  });

  describe('a rejected publish attempt', () => {
    it('lowers the success-rate component without affecting other signals', () => {
      const clean = computeTrustScore({ ...NEUTRAL, accountAgeDays: 60, publishAttempts: { published: 2, rejected: 0 } });
      const withRejection = computeTrustScore({ ...NEUTRAL, accountAgeDays: 60, publishAttempts: { published: 2, rejected: 1 } });
      expect(withRejection.breakdown.accountAgePoints).toBe(clean.breakdown.accountAgePoints);
      expect(withRejection.breakdown.publishSuccessRatePoints).toBeLessThan(clean.breakdown.publishSuccessRatePoints);
    });
  });

  describe('a suspension', () => {
    it('applies a flat -25 penalty on top of otherwise-positive signals', () => {
      const withoutSuspension = computeTrustScore({
        accountAgeDays: 90,
        publishedListingCount: 6,
        publishAttempts: { published: 4, rejected: 0 },
        hasSuspendedListing: false,
      });
      const withSuspension = computeTrustScore({
        accountAgeDays: 90,
        publishedListingCount: 6,
        publishAttempts: { published: 4, rejected: 0 },
        hasSuspendedListing: true,
      });
      expect(withoutSuspension.score).toBe(100);
      expect(withSuspension.score).toBe(75);
      expect(withSuspension.breakdown.suspensionPenalty).toBe(-25);
    });

    it('floors the total score at 0 rather than going negative', () => {
      const result = computeTrustScore({ ...NEUTRAL, hasSuspendedListing: true });
      expect(result.score).toBe(0);
    });
  });

  describe('combined signals', () => {
    it('sums every signal to the documented maximum of 100', () => {
      const result = computeTrustScore({
        accountAgeDays: 365,
        publishedListingCount: 10,
        publishAttempts: { published: 10, rejected: 0 },
        hasSuspendedListing: false,
      });
      expect(result.score).toBe(100);
    });

    it('combines age, listings, and a mixed publish record deterministically', () => {
      const result = computeTrustScore({
        accountAgeDays: 45, // -> 10
        publishedListingCount: 2, // -> 10
        publishAttempts: { published: 1, rejected: 1 }, // 50% -> 20
        hasSuspendedListing: false,
      });
      expect(result.breakdown).toEqual({
        accountAgePoints: 10,
        publishedListingsPoints: 10,
        publishSuccessRatePoints: 20,
        suspensionPenalty: 0,
      });
      expect(result.score).toBe(40);
    });
  });
});

describe('computeVerificationTier', () => {
  it('is "unverified" for a pending account regardless of audit status', () => {
    expect(computeVerificationTier('pending', null)).toBe('unverified');
    expect(computeVerificationTier('pending', new Date())).toBe('unverified');
  });

  it('is "unverified" for a suspended account regardless of audit status', () => {
    expect(computeVerificationTier('suspended', new Date())).toBe('unverified');
  });

  it('is "verified" for a verified account with no security audit', () => {
    expect(computeVerificationTier('verified', null)).toBe('verified');
  });

  it('never reaches "verified_enterprise" without securityAuditPassedAt set — the negative case', () => {
    const tier = computeVerificationTier('verified', null);
    expect(tier).not.toBe('verified_enterprise');
  });

  it('reaches "verified_enterprise" only once both status is verified AND the audit has passed', () => {
    expect(computeVerificationTier('verified', new Date())).toBe('verified_enterprise');
  });
});
