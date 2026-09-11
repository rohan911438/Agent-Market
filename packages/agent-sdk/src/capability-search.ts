import { buildUrl, readError } from './http.js';
import type { CapabilitySearchQuery, CapabilitySearchResult } from './types.js';

/**
 * Ranked discovery — POST /v1/discover (Phase 11): scores the catalog
 * against a free-text task description plus optional constraints, using the
 * server's documented relevance/trust/constraint-fit formula (see
 * apps/api/src/services/discovery-ranking.ts). Distinct from
 * `discoverListings` (discovery.ts), which is pure client-side filtering
 * over the flat catalog by category/price/substring — this is the "state a
 * job, get ranked results" primitive the platform strategy's
 * `find_capability` example describes.
 */
export async function searchCapabilities(
  fetchImpl: typeof fetch,
  baseUrl: string,
  query: CapabilitySearchQuery,
): Promise<CapabilitySearchResult[]> {
  const res = await fetchImpl(buildUrl(baseUrl, '/v1/discover'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
  });

  if (!res.ok) return readError(res);

  const body = (await res.json()) as { results: CapabilitySearchResult[] };
  return body.results;
}
