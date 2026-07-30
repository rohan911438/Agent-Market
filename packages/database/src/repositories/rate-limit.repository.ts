import type { PrismaClient, RateLimit } from '@prisma/client';

export class RateLimitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Atomically bumps (or creates) the counter for a fixed window, returning the new count. */
  async increment(identifier: string, windowStart: Date, walletId?: string): Promise<RateLimit> {
    return this.prisma.rateLimit.upsert({
      where: { identifier_windowStart: { identifier, windowStart } },
      update: { requestCount: { increment: 1 } },
      create: { identifier, windowStart, walletId, requestCount: 1 },
    });
  }

  getWindow(identifier: string, windowStart: Date): Promise<RateLimit | null> {
    return this.prisma.rateLimit.findUnique({
      where: { identifier_windowStart: { identifier, windowStart } },
    });
  }
}
