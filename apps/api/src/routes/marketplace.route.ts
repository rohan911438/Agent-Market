import type { MarketplaceApi, MarketplaceCollection, MarketplaceResponse, PricingModel } from '@agentmarket/shared-types';
import type { ProviderAccount } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { formatPriceLabel, isRecentlyPublished } from '../services/marketplace-sections.js';
import { computeProviderTrust, type ProviderTrustSummary } from '../services/trust-score.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Free — lists every catalog entry: first-party endpoints we operate
 * directly, plus every third-party listing published through the control
 * plane (see routes/control-plane/). One read model for both, so the
 * marketplace page and an agent's discovery query never see a different
 * catalog than this — see "The Marketplace" in the platform strategy doc
 * for why that has to stay true.
 *
 * Phase 10 adds the storefront's computed fields (isNew, callCount7d,
 * priceLabel, avgRating/reviewCount) and curated `collections` directly onto
 * this same response, rather than a second endpoint — the storefront is a
 * read view over this one discovery API, not a diverging CMS.
 */
export function registerMarketplaceRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/v1/marketplace', async () => {
    const now = new Date();
    const since7d = new Date(now.getTime() - SEVEN_DAYS_MS);

    const [firstParty, published, collectionRows] = await Promise.all([
      ctx.db.marketplaceApis.list(),
      ctx.db.apiListings.listPublished(),
      ctx.db.collections.list(),
    ]);

    const [routeCounts, listingCounts] = await Promise.all([
      ctx.db.apiRequests.countsByRoutes(firstParty.map((a) => a.endpoint), since7d),
      ctx.db.apiRequests.countsByListingIds(published.map((l) => l.id), since7d),
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

    const firstPartyViews: MarketplaceApi[] = firstParty.map((api) => ({
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
    }));

    const thirdPartyViews: MarketplaceApi[] = await Promise.all(
      published.map(async (listing) => {
        const trust = await trustFor(listing.providerAccount);
        const pricingModel = listing.pricingModel as PricingModel;
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
        };
      }),
    );

    const apis = [...firstPartyViews, ...thirdPartyViews];
    const apiById = new Map(apis.map((a) => [a.id, a]));

    // Dangling ids (a collection referencing a listing that was later
    // unpublished or deleted) are silently skipped, never a broken shelf —
    // see Collection's schema comment for why this is a soft reference.
    const collections: MarketplaceCollection[] = collectionRows.map((collection) => {
      const ids = JSON.parse(collection.listingIds) as string[];
      return {
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
        listings: ids.map((id) => apiById.get(id)).filter((a): a is MarketplaceApi => a !== undefined),
      };
    });

    const response: MarketplaceResponse = { apis, collections };
    return response;
  });
}
