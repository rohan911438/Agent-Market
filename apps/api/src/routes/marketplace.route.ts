import type { MarketplaceApi } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

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

    const thirdParty: MarketplaceApi[] = published.map((listing) => ({
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
    }));

    return { apis: [...firstParty, ...thirdParty] };
  });
}
