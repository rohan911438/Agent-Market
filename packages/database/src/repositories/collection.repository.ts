import type { Collection, PrismaClient } from '@prisma/client';

export interface UpsertCollectionInput {
  slug: string;
  name: string;
  description: string;
  /** Ordered catalog entry ids (ApiListing.id or MarketplaceApi.id) — stored JSON-encoded, resolved against the live catalog at read time. */
  listingIds: string[];
  position?: number;
}

/**
 * Admin/operator-curated shelves (Phase 10) — e.g. "Featured". No
 * self-service UI; populated by a direct DB seed or the admin-only upsert
 * endpoint (routes/admin/collections.route.ts) only.
 */
export class CollectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  upsertBySlug(input: UpsertCollectionInput): Promise<Collection> {
    const data = {
      name: input.name,
      description: input.description,
      listingIds: JSON.stringify(input.listingIds),
      ...(input.position !== undefined ? { position: input.position } : {}),
    };
    return this.prisma.collection.upsert({
      where: { slug: input.slug },
      update: data,
      create: { slug: input.slug, ...data },
    });
  }

  list(): Promise<Collection[]> {
    return this.prisma.collection.findMany({ orderBy: { position: 'asc' } });
  }
}
