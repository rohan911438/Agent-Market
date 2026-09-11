import type { Payout, PrismaClient } from '@prisma/client';

export interface CreatePayoutInput {
  providerAccountId: string;
  amountUsd: number;
  periodStart: Date;
  periodEnd: Date;
  status?: string;
}

/**
 * Ledger records only — see Phase 07 "Not in scope": nothing here moves real
 * money. A row is bookkeeping of what a provider is owed for a period, not a
 * disbursement instruction.
 */
export class PayoutRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreatePayoutInput): Promise<Payout> {
    return this.prisma.payout.create({
      data: { ...input, status: input.status ?? 'pending' },
    });
  }

  listByProvider(providerAccountId: string, limit = 20): Promise<Payout[]> {
    return this.prisma.payout.findMany({
      where: { providerAccountId },
      orderBy: { periodEnd: 'desc' },
      take: limit,
    });
  }
}
