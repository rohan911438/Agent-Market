import { z } from 'zod';
import { EndpointStatusSchema } from './common.js';
import { VerificationTierSchema } from './control-plane.js';

export const MarketplaceApiSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  priceUsd: z.number().nonnegative(),
  endpoint: z.string(),
  status: EndpointStatusSchema,
  /** Present only for third-party listings published through the control plane. */
  providerName: z.string().optional(),
  isThirdParty: z.boolean().optional(),
  version: z.string().optional(),
  /** Present only for third-party listings — see services/trust-score.ts. Absent (not zero) for first-party endpoints, which have no provider account to score. */
  providerTrustScore: z.number().int().min(0).max(100).optional(),
  providerVerificationTier: VerificationTierSchema.optional(),
});
export type MarketplaceApi = z.infer<typeof MarketplaceApiSchema>;
