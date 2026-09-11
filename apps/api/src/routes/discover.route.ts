import { DiscoverRequestSchema, type DiscoverRequest, type DiscoverResponse } from '@rohankumar4179/shared-types';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { buildMergedCatalog } from '../services/catalog.js';
import { percentile } from '../services/analytics.js';
import { scoreCandidates, type DiscoveryCandidate } from '../services/discovery-ranking.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The discovery primitive itself — an agent states a job in natural language
 * plus optional operational constraints, ranked against the same merged
 * catalog GET /v1/marketplace serves (services/catalog.ts). See
 * discovery-ranking.ts for the documented, inspectable scoring formula.
 * Exported so the MCP `discover_capabilities` tool (services/mcp-tool-executor.ts,
 * Phase "MCP Agent-Native Interface") calls this exact function in-process
 * instead of re-deriving the same ranking — one discovery implementation,
 * two entry points (REST and MCP), matching workflow-step-registry.ts's
 * precedent of reusing a route's own exported handler.
 */
export async function runDiscovery(ctx: AppContext, input: DiscoverRequest): Promise<DiscoverResponse> {
  const { apis, firstPartyRaw, thirdPartyRaw } = await buildMergedCatalog(ctx);
  const since7d = new Date(Date.now() - SEVEN_DAYS_MS);

  const [latencyByRoute, latencyByListing] = await Promise.all([
    ctx.db.apiRequests.latencyMsByRoutes(firstPartyRaw.map((a) => a.endpoint), since7d),
    ctx.db.apiRequests.latencyMsByListingIds(thirdPartyRaw.map((l) => l.id), since7d),
  ]);

  const apiById = new Map(apis.map((a) => [a.id, a]));
  const tagsByListingId = new Map(thirdPartyRaw.map((l) => [l.id, JSON.parse(l.tags) as string[]]));

  const candidates: DiscoveryCandidate[] = apis.map((api) => {
    const latencies = api.isThirdParty ? latencyByListing.get(api.id) : latencyByRoute.get(api.endpoint);
    return {
      listingId: api.id,
      name: api.name,
      description: api.description,
      tags: tagsByListingId.get(api.id) ?? [],
      priceUsd: api.priceUsd,
      trustScore: api.providerTrustScore ?? null,
      latencyMsP95: latencies && latencies.length > 0 ? percentile(latencies, 95) : null,
    };
  });

  const ranked = scoreCandidates(input.task, candidates, input.constraints ?? {});

  return {
    results: ranked.map((r) => ({ listing: apiById.get(r.listingId)!, score: r.score, reasons: r.reasons })),
  };
}

/**
 * Public — this is a discovery primitive an agent calls before it's
 * necessarily a paying customer of anything (see the platform strategy's
 * `find_capability({ task, constraints })` example).
 */
export function registerDiscoverRoute(server: FastifyInstance, ctx: AppContext): void {
  server.post('/v1/discover', async (request) => {
    const input = DiscoverRequestSchema.parse(request.body);
    return runDiscovery(ctx, input);
  });
}
