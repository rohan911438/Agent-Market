/**
 * Availability score (Phase 13) — a per-listing/per-endpoint uptime
 * percentage over a rolling 90-day window, backing Phase 08's trust score
 * and Phase 10's storefront badges with a real number instead of a
 * placeholder. Computed on read (not a periodic rollup job) — the current
 * catalog and request volume are small enough that this is cheap; revisit
 * only if that stops being true.
 *
 * "Available" means the endpoint was reachable and responded without a
 * server-side failure — statusCode < 500 for real traffic, or a reachable
 * upstream for a synthetic probe. A 4xx (the *caller's* bad input) doesn't
 * count against availability; that's a request-quality signal, not an
 * uptime one.
 *
 * For first-party endpoints, real ApiRequest traffic exists today, so it
 * dominates. For third-party listings, no gateway routes real traffic yet
 * (see Phase 07/09's honesty notes), so real traffic will usually be zero —
 * the synthetic probe (observability/synthetic-checks.ts) against the
 * listing's own `upstreamUrl` is the only signal until that changes. Both
 * sources are blended into one number rather than picking one, so the
 * score quietly improves in accuracy as real traffic starts flowing,
 * without a code change.
 */

import type { AppContext } from '../context.js';

export interface AvailabilityCounts {
  total: number;
  successful: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const FIRST_PARTY_SYNTHETIC_TARGET = 'first-party';

export function availabilityWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - NINETY_DAYS_MS);
}

/** Null means "no data yet" — never a fabricated 100% or 0%. Rounded to 2 decimal places. */
export function computeAvailabilityPct(counts: AvailabilityCounts): number | null {
  if (counts.total === 0) return null;
  return Math.round((counts.successful / counts.total) * 10000) / 100;
}

export function combineAvailabilityCounts(a: AvailabilityCounts, b: AvailabilityCounts): AvailabilityCounts {
  return { total: a.total + b.total, successful: a.successful + b.successful };
}

const ZERO_COUNTS: AvailabilityCounts = { total: 0, successful: 0 };

export interface CatalogAvailability {
  byRoute: Map<string, number | null>;
  byListingId: Map<string, number | null>;
}

/**
 * Availability for a whole catalog batch in one round trip per source —
 * called once from services/catalog.ts's buildMergedCatalog, not once per
 * entry.
 */
export async function computeCatalogAvailability(
  ctx: AppContext,
  firstPartyRoutes: string[],
  thirdPartyListingIds: string[],
  now: Date = new Date(),
): Promise<CatalogAvailability> {
  const since = availabilityWindowStart(now);

  const [routeRequestCounts, listingRequestCounts, firstPartySynthetic, thirdPartySynthetic] = await Promise.all([
    ctx.db.apiRequests.availabilityCountsByRoutes(firstPartyRoutes, since),
    ctx.db.apiRequests.availabilityCountsByListingIds(thirdPartyListingIds, since),
    ctx.db.syntheticChecks.countsSince(FIRST_PARTY_SYNTHETIC_TARGET, since),
    ctx.db.syntheticChecks.countsByTargetsSince(thirdPartyListingIds, since),
  ]);

  const byRoute = new Map(
    firstPartyRoutes.map((route) => [
      route,
      computeAvailabilityPct(combineAvailabilityCounts(routeRequestCounts.get(route) ?? ZERO_COUNTS, firstPartySynthetic)),
    ]),
  );

  const byListingId = new Map(
    thirdPartyListingIds.map((id) => [
      id,
      computeAvailabilityPct(
        combineAvailabilityCounts(listingRequestCounts.get(id) ?? ZERO_COUNTS, thirdPartySynthetic.get(id) ?? ZERO_COUNTS),
      ),
    ]),
  );

  return { byRoute, byListingId };
}

export { FIRST_PARTY_SYNTHETIC_TARGET };
