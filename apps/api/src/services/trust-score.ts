import type { VerificationTier } from '@agentmarket/shared-types';
import type { ProviderAccount } from '@prisma/client';
import type { AppContext } from '../context.js';

export interface TrustScoreInput {
  accountAgeDays: number;
  publishedListingCount: number;
  publishAttempts: { published: number; rejected: number };
  hasSuspendedListing: boolean;
}

export interface TrustScoreBreakdown {
  accountAgePoints: number;
  publishedListingsPoints: number;
  publishSuccessRatePoints: number;
  suspensionPenalty: number;
}

export interface TrustScoreResult {
  score: number;
  breakdown: TrustScoreBreakdown;
}

/**
 * v1 trust score — rules-based and deliberately simple, NOT a black box or a
 * learned model. Every weight below is the entire formula; if it needs to
 * change, change the numbers here (and this comment), don't bolt something
 * else on top of it.
 *
 *   - Account age:            +10 per 30 days, capped at 30 (90+ days maxes out)
 *   - Published listings:     +5 per published listing, capped at 30 (6+ listings maxes out)
 *   - Publish success rate:   rate * 40, where rate = published / (published + rejected)
 *                             attempts, capped at 40; 0 when there have been no
 *                             publish attempts yet (no evidence, no credit — not
 *                             a fabricated middling score)
 *   - Suspension penalty:     -25 flat if any of the provider's listings has ever
 *                             been suspended
 *
 * Max positive signal is exactly 100 (30 + 30 + 40); the suspension penalty
 * can pull a score below what the positive signals alone would suggest.
 * Final score is clamped to [0, 100].
 */
export function computeTrustScore(input: TrustScoreInput): TrustScoreResult {
  const accountAgePoints = Math.min(30, Math.floor(input.accountAgeDays / 30) * 10);
  const publishedListingsPoints = Math.min(30, input.publishedListingCount * 5);

  const totalAttempts = input.publishAttempts.published + input.publishAttempts.rejected;
  const publishSuccessRatePoints =
    totalAttempts === 0 ? 0 : Math.round((input.publishAttempts.published / totalAttempts) * 40);

  const suspensionPenalty = input.hasSuspendedListing ? -25 : 0;

  const rawScore = accountAgePoints + publishedListingsPoints + publishSuccessRatePoints + suspensionPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    breakdown: { accountAgePoints, publishedListingsPoints, publishSuccessRatePoints, suspensionPenalty },
  };
}

/**
 * The ladder itself: `status` (pending/verified/suspended) governs whether
 * the account can operate at all and is computed elsewhere; this only
 * governs how much a verified account is trusted. Any status other than
 * "verified" collapses to "unverified" here — a suspended account's tier
 * doesn't matter once it can't operate, and a merely-pending account hasn't
 * earned any tier yet regardless of other history.
 */
export function computeVerificationTier(
  status: string,
  securityAuditPassedAt: Date | null,
): VerificationTier {
  if (status !== 'verified') return 'unverified';
  return securityAuditPassedAt ? 'verified_enterprise' : 'verified';
}

export interface ProviderTrustSummary {
  trustScore: number;
  verificationTier: VerificationTier;
}

/**
 * The I/O wrapper around the two pure functions above: gathers the signals
 * `computeTrustScore` needs from the database and combines both results.
 * Kept separate from the pure functions so the scoring rules stay
 * unit-testable without a database (same discipline as listing-publish-gate.ts).
 */
export async function computeProviderTrust(ctx: AppContext, account: ProviderAccount): Promise<ProviderTrustSummary> {
  const [listings, published, rejected] = await Promise.all([
    ctx.db.apiListings.listByProvider(account.id),
    ctx.db.auditLogs.countByActorAndAction(account.id, 'listing.published'),
    ctx.db.auditLogs.countByActorAndAction(account.id, 'listing.publish_rejected'),
  ]);

  const accountAgeDays = (Date.now() - account.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const publishedListingCount = listings.filter((l) => l.status === 'published').length;
  const hasSuspendedListing = listings.some((l) => l.status === 'suspended');

  const { score } = computeTrustScore({
    accountAgeDays,
    publishedListingCount,
    publishAttempts: { published, rejected },
    hasSuspendedListing,
  });

  return { trustScore: score, verificationTier: computeVerificationTier(account.status, account.securityAuditPassedAt) };
}
