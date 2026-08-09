import { z } from 'zod';
import { EndpointStatusSchema } from './common.js';
import { PricingModelSchema, VerificationTierSchema } from './control-plane.js';

export const MarketplaceApiSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  priceUsd: z.number().nonnegative(),
  /** pay_per_call for every first-party endpoint (the only model that architecture supports); the listing's own model for third-party. */
  pricingModel: PricingModelSchema,
  /** The full display string (e.g. "$0.05 / call", "$9.99 / month") — computed once server-side (services/marketplace-sections.ts) so the unit is never wrong, see Phase 10. */
  priceLabel: z.string(),
  endpoint: z.string(),
  status: EndpointStatusSchema,
  /** Present only for third-party listings published through the control plane. */
  providerName: z.string().optional(),
  isThirdParty: z.boolean().optional(),
  version: z.string().optional(),
  /** Present only for third-party listings — see services/trust-score.ts. Absent (not zero) for first-party endpoints, which have no provider account to score. */
  providerTrustScore: z.number().int().min(0).max(100).optional(),
  providerVerificationTier: VerificationTierSchema.optional(),
  /** Published/added within the last 14 days — see services/marketplace-sections.ts#isRecentlyPublished. */
  isNew: z.boolean(),
  /** Real call volume over the trailing 7 days (Phase 9's ApiRequest data) — the storefront's honest "Trending" signal, never fabricated. */
  callCount7d: z.number().int().nonnegative(),
  /** Schema placeholder only (Phase 10) — no review submission flow exists yet. Null means "no rating data", not a fabricated 0-star average. */
  avgRating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
});
export type MarketplaceApi = z.infer<typeof MarketplaceApiSchema>;

export const MarketplaceCollectionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  listings: z.array(MarketplaceApiSchema),
});
export type MarketplaceCollection = z.infer<typeof MarketplaceCollectionSchema>;

export const MarketplaceResponseSchema = z.object({
  apis: z.array(MarketplaceApiSchema),
  collections: z.array(MarketplaceCollectionSchema),
});
export type MarketplaceResponse = z.infer<typeof MarketplaceResponseSchema>;
