import type { PrismaClient, Usage } from '@prisma/client';

function dayBucket(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export class UsageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Usage rows are always wallet-scoped — this is only ever called after a
   * payment settles, which always has a walletId by then. Free/anonymous
   * traffic is observable via ApiRequest, not Usage.
   */
  async record(route: string, spendUsd: number, walletId: string, userId?: string): Promise<Usage> {
    const date = dayBucket(new Date());
    return this.prisma.usage.upsert({
      where: { walletId_date_route: { walletId, date, route } },
      update: { requestCount: { increment: 1 }, spendUsd: { increment: spendUsd } },
      create: { date, route, walletId, userId, requestCount: 1, spendUsd },
    });
  }

  summaryForWallet(walletId: string, sinceDays = 30): Promise<Usage[]> {
    const since = dayBucket(new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000));
    return this.prisma.usage.findMany({
      where: { walletId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
  }
}
