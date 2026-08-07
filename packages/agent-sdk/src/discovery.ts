import type { DiscoverQuery, MarketplaceListing } from './types.js';

/**
 * Filters the public catalog (`GET /v1/marketplace` — the same read model
 * the marketplace *page* renders, see apps/api/src/routes/marketplace.route.ts)
 * client-side. This is deliberately simple: exact category match, a price
 * ceiling, and a substring search — "provider selection" as basic
 * filtering, not the semantic/intent ranking the AI Discovery roadmap item
 * describes. Good enough to pick between a handful of competing listings
 * for the same capability; not a recommendation engine.
 */
export async function discoverListings(
  fetchImpl: typeof fetch,
  baseUrl: string,
  query: DiscoverQuery = {},
): Promise<MarketplaceListing[]> {
  const res = await fetchImpl(`${baseUrl}/v1/marketplace`);
  if (!res.ok) {
    throw new Error(`Failed to load the marketplace catalog: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { apis: MarketplaceListing[] };
  const search = query.search?.toLowerCase();

  return body.apis
    .filter((api) => !query.category || api.category.toLowerCase() === query.category.toLowerCase())
    .filter((api) => query.maxPriceUsd === undefined || api.priceUsd <= query.maxPriceUsd)
    .filter((api) => !search || `${api.name} ${api.description}`.toLowerCase().includes(search))
    .sort((a, b) => a.priceUsd - b.priceUsd);
}
