import type { MarketplaceApi, PrismaClient } from '@prisma/client';

export class MarketplaceApiRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(): Promise<MarketplaceApi[]> {
    return this.prisma.marketplaceApi.findMany({ orderBy: { category: 'asc' } });
  }

  findBySlug(slug: string): Promise<MarketplaceApi | null> {
    return this.prisma.marketplaceApi.findUnique({ where: { slug } });
  }

  upsert(input: Omit<MarketplaceApi, 'id' | 'createdAt'>): Promise<MarketplaceApi> {
    return this.prisma.marketplaceApi.upsert({
      where: { slug: input.slug },
      update: input,
      create: input,
    });
  }
}
