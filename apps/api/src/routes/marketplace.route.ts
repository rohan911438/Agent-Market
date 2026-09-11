import type { MarketplaceApi } from '@agentmarket/shared-types';
import type { ProviderAccount } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { computeProviderTrust, type ProviderTrustSummary } from '../services/trust-score.js';

/**
 * Free — lists every catalog entry: first-party endpoints we operate
 * directly, plus every third-party listing published through the control
 * plane (see routes/control-plane/). One read model for both, so the
 * marketplace page and an agent's discovery query never see a different
 * catalog than this — see "The Marketplace" in the platform strategy doc
 * for why that has to stay true.
 */
export function registerMarketplaceRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/v1/marketplace', async () => {
    const [firstParty, published] = await Promise.all([
      ctx.db.marketplaceApis.list(),
      ctx.db.apiListings.listPublished(),
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

    const thirdParty: MarketplaceApi[] = await Promise.all(
      published.map(async (listing) => {
        const trust = await trustFor(listing.providerAccount);
        return {
          id: listing.id,
          slug: listing.slug,
          name: listing.name,
          description: listing.description,
          category: listing.category,
          priceUsd: listing.priceUsd ?? 0,
          endpoint: listing.upstreamUrl,
          // Not yet proxied through our own gateway (see the roadmap's 6-month
          // architecture milestone) — "beta" is the honest status until it is.
          status: 'beta',
          providerName: listing.providerAccount.name,
          isThirdParty: true,
          version: listing.version,
          providerTrustScore: trust.trustScore,
          providerVerificationTier: trust.verificationTier,
        };
      }),
    );

    return { apis: [...firstParty, ...thirdParty] };
  });
}
