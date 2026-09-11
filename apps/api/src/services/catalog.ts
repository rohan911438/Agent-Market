import type { PublishedApiListing } from '@agentmarket/database';
import type { MarketplaceApi } from '@rohankumar4179/shared-types';
import type { MarketplaceApi as MarketplaceApiRow, ProviderAccount } from '@prisma/client';
import type { AppContext } from '../context.js';
import { computeCatalogAvailability } from './availability.js';
import { formatPriceLabel, isRecentlyPublished } from './marketplace-sections.js';
import { computeProviderTrust, type ProviderTrustSummary } from './trust-score.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface MergedCatalog {
  apis: MarketplaceApi[];
  /** Raw rows behind `apis`, for callers (e.g. discover.route.ts) that need fields not on the public MarketplaceApi view — tags, latency, etc. */
  firstPartyRaw: MarketplaceApiRow[];
  thirdPartyRaw: PublishedApiListing[];
}

/**
 * The one place that merges first-party endpoints + published third-party
 * listings into the public `MarketplaceApi` view, with Phase 10's computed
 * fields (isNew, callCount7d, priceLabel) and Phase 08's trust fields.
 * Shared by GET /v1/marketplace and POST /v1/discover (Phase 11) so both
 * ever see the same catalog — see marketplace.route.ts's comment on why
 * that has to stay true — instead of two divergent implementations.
 */
export async function buildMergedCatalog(ctx: AppContext): Promise<MergedCatalog> {
  const now = new Date();
  const since7d = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [firstPartyRaw, thirdPartyRaw] = await Promise.all([
    ctx.db.marketplaceApis.list(),
    ctx.db.apiListings.listPublished(),
  ]);

  const [routeCounts, listingCounts, availability] = await Promise.all([
    ctx.db.apiRequests.countsByRoutes(firstPartyRaw.map((a) => a.endpoint), since7d),
    ctx.db.apiRequests.countsByListingIds(thirdPartyRaw.map((l) => l.id), since7d),
    computeCatalogAvailability(
      ctx,
      firstPartyRaw.map((a) => a.endpoint),
      thirdPartyRaw.map((l) => l.id),
      now,
    ),
  ]);

  // Many listings can share the same provider account — compute each
  // provider's trust once, not once per listing.
  const trustByProvider = new Map<string, Promise<ProviderTrustSummary>>();
  function trustFor(account: ProviderAccount): Promise<ProviderTrustSummary> {
    let cached = trustByProvider.get(account.id);
    if (!cached) {
      cached = computeProviderTrust(ctx, account);
      trustByProvider.set(account.id, cached);
    }
    return cached;
  }

  const firstPartyViews: MarketplaceApi[] = firstPartyRaw.map((api) => ({
    id: api.id,
    slug: api.slug,
    name: api.name,
    description: api.description,
    category: api.category,
    priceUsd: api.priceUsd,
    // Every first-party endpoint is metered pay-per-call — the only model
    // the current x402 architecture supports for them.
    pricingModel: 'pay_per_call',
    priceLabel: formatPriceLabel(api.priceUsd, 'pay_per_call'),
    endpoint: api.endpoint,
    status: api.status as MarketplaceApi['status'],
    isNew: isRecentlyPublished(api.createdAt, now),
    callCount7d: routeCounts.get(api.endpoint) ?? 0,
    // No review system exists yet (Phase 10 scope) — honest empty state, not a fabricated rating.
    avgRating: null,
    reviewCount: 0,
    availabilityPct: availability.byRoute.get(api.endpoint) ?? null,
  }));

  const thirdPartyViews: MarketplaceApi[] = await Promise.all(
    thirdPartyRaw.map(async (listing) => {
      const trust = await trustFor(listing.providerAccount);
      const pricingModel = listing.pricingModel as MarketplaceApi['pricingModel'];
      return {
        id: listing.id,
        slug: listing.slug,
        name: listing.name,
        description: listing.description,
        category: listing.category,
        priceUsd: listing.priceUsd ?? 0,
        pricingModel,
        priceLabel: formatPriceLabel(listing.priceUsd ?? 0, pricingModel),
        endpoint: listing.upstreamUrl,
        // Not yet proxied through our own gateway (see the roadmap's 6-month
        // architecture milestone) — "beta" is the honest status until it is.
        status: 'beta',
        providerName: listing.providerAccount.name,
        isThirdParty: true,
        version: listing.version,
        providerTrustScore: trust.trustScore,
        providerVerificationTier: trust.verificationTier,
        isNew: isRecentlyPublished(listing.publishedAt, now),
        callCount7d: listingCounts.get(listing.id) ?? 0,
        avgRating: listing.avgRating,
        reviewCount: listing.reviewCount,
        availabilityPct: availability.byListingId.get(listing.id) ?? null,
      };
    }),
  );

  return { apis: [...firstPartyViews, ...thirdPartyViews], firstPartyRaw, thirdPartyRaw };
}
