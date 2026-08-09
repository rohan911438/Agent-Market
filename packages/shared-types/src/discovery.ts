import { z } from 'zod';
import { MarketplaceApiSchema } from './marketplace.js';

/**
 * POST /v1/discover (Phase 11) — the AI Discovery primitive: an agent
 * states a job in natural language plus optional operational constraints,
 * instead of constructing a keyword query by hand (see
 * apps/api/src/services/discovery-ranking.ts for the scoring formula).
 */
export const DiscoveryConstraintsSchema = z.object({
  maxLatencyMs: z.number().positive().optional(),
  maxCostPerCall: z.number().nonnegative().optional(),
});
export type DiscoveryConstraints = z.infer<typeof DiscoveryConstraintsSchema>;

export const DiscoverRequestSchema = z.object({
  task: z.string().trim().min(1).max(500),
  constraints: DiscoveryConstraintsSchema.optional(),
});
export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;

/** `reasons` is not optional decoration — it's why the ranking can be trusted rather than a bare, unexplained number. */
export const DiscoveryResultSchema = z.object({
  listing: MarketplaceApiSchema,
  score: z.number(),
  reasons: z.array(z.string()),
});
export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

export const DiscoverResponseSchema = z.object({
  results: z.array(DiscoveryResultSchema),
});
export type DiscoverResponse = z.infer<typeof DiscoverResponseSchema>;
