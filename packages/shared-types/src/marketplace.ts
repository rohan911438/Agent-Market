import { z } from 'zod';
import { EndpointStatusSchema } from './common.js';

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
});
export type MarketplaceApi = z.infer<typeof MarketplaceApiSchema>;
