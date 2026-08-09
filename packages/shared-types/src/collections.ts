import { z } from 'zod';

/**
 * Body for the admin-only POST /v1/admin/collections upsert (Phase 10).
 * `listingIds` are opaque catalog entry ids (an `ApiListing.id` or a
 * `MarketplaceApi.id`) — not validated for existence at write time; any id
 * that doesn't resolve against the live catalog is simply skipped when the
 * collection is read (see marketplace.route.ts), so a stale id can never
 * break the storefront.
 */
export const UpsertCollectionRequestSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, numbers and hyphens only'),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(500),
  listingIds: z.array(z.string().trim().min(1)).max(50),
  position: z.number().int().min(0).optional(),
});
export type UpsertCollectionRequest = z.infer<typeof UpsertCollectionRequestSchema>;

export const CollectionViewSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  listingIds: z.array(z.string()),
  position: z.number().int(),
});
export type CollectionView = z.infer<typeof CollectionViewSchema>;
