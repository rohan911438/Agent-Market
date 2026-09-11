import type { MarketplaceApi, MarketplaceCollection, MarketplaceResponse } from '@rohankumar4179/shared-types';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { buildMergedCatalog } from '../services/catalog.js';

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
 * read view over this one discovery API, not a diverging CMS. The merge
 * itself lives in services/catalog.ts, shared with POST /v1/discover
 * (Phase 11) so both ever see the same catalog.
 */
export function registerMarketplaceRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/v1/marketplace', async () => {
    const [{ apis }, collectionRows] = await Promise.all([buildMergedCatalog(ctx), ctx.db.collections.list()]);
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
