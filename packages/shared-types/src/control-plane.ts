import { z } from 'zod';

export const ProviderAccountStatusSchema = z.enum(['pending', 'verified', 'suspended']);
export type ProviderAccountStatus = z.infer<typeof ProviderAccountStatusSchema>;

export const ListingStatusSchema = z.enum(['draft', 'published', 'suspended']);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const PricingModelSchema = z.enum(['pay_per_call', 'subscription', 'bundle']);
export type PricingModel = z.infer<typeof PricingModelSchema>;

/**
 * Format-only check (58 base32 characters) — enough to catch typos and
 * garbage input at the door. Real checksum/ownership verification belongs
 * to a KYC/identity provider integration, not this gate; see the
 * "Verification & Trust" section of the platform strategy for the graduated
 * ladder this is the bottom rung of.
 */
export const AlgorandAddressSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-7]{58}$/, 'must look like an Algorand address (58 base32 characters)');

export const RegisterProviderRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  walletAddress: AlgorandAddressSchema,
});
export type RegisterProviderRequest = z.infer<typeof RegisterProviderRequestSchema>;

export const RegisterProviderResponseSchema = z.object({
  providerId: z.string(),
  status: ProviderAccountStatusSchema,
  /** Shown exactly once — only its hash is ever persisted. */
  apiKey: z.string(),
});
export type RegisterProviderResponse = z.infer<typeof RegisterProviderResponseSchema>;

export const ProviderAccountViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: ProviderAccountStatusSchema,
  verifiedAt: z.string().datetime().nullable(),
});
export type ProviderAccountView = z.infer<typeof ProviderAccountViewSchema>;

export const CreateListingRequestSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, 'lowercase letters, numbers and hyphens only'),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(2000),
  category: z.string().trim().min(2).max(60),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  upstreamUrl: z.string().trim().url(),
  openApiSpec: z.string().trim().min(2).optional(),
  docsUrl: z.string().trim().url().optional(),
});
export type CreateListingRequest = z.infer<typeof CreateListingRequestSchema>;

export const ConfigurePricingRequestSchema = z.object({
  pricingModel: PricingModelSchema,
  priceUsd: z.number().positive().max(1000),
});
export type ConfigurePricingRequest = z.infer<typeof ConfigurePricingRequestSchema>;

export const ConfigurePaymentRequestSchema = z.object({
  payoutWalletAddress: AlgorandAddressSchema,
  payoutSplitBps: z.number().int().min(0).max(10000).optional(),
});
export type ConfigurePaymentRequest = z.infer<typeof ConfigurePaymentRequestSchema>;

export const ApiListingViewSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  version: z.string(),
  upstreamUrl: z.string(),
  docsUrl: z.string().nullable(),
  pricingModel: PricingModelSchema,
  priceUsd: z.number().nullable(),
  payoutWalletAddress: z.string().nullable(),
  status: ListingStatusSchema,
  publishedAt: z.string().datetime().nullable(),
});
export type ApiListingView = z.infer<typeof ApiListingViewSchema>;

export const PublishRequirementSchema = z.object({
  key: z.string(),
  met: z.boolean(),
  message: z.string(),
});
export type PublishRequirement = z.infer<typeof PublishRequirementSchema>;

export const PublishRejectedResponseSchema = z.object({
  requirements: z.array(PublishRequirementSchema),
});
export type PublishRejectedResponse = z.infer<typeof PublishRejectedResponseSchema>;
