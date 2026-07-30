import type { CachedResponse, PrismaClient } from '@prisma/client';

export class CachedResponseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findFresh(cacheKey: string): Promise<CachedResponse | null> {
    const row = await this.prisma.cachedResponse.findUnique({ where: { cacheKey } });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  upsert(cacheKey: string, route: string, payload: string, expiresAt: Date): Promise<CachedResponse> {
    return this.prisma.cachedResponse.upsert({
      where: { cacheKey },
      update: { payload, expiresAt, route },
      create: { cacheKey, route, payload, expiresAt },
    });
  }
}
