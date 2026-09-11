import type { PrismaClient, SyntheticCheck } from '@prisma/client';

export interface RecordSyntheticCheckInput {
  target: string;
  targetType: 'first_party' | 'third_party';
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

/** Periodic reachability probes (Phase 13's synthetic monitoring) — see the SyntheticCheck model's schema comment. */
export class SyntheticCheckRepository {
  constructor(private readonly prisma: PrismaClient) {}

  record(input: RecordSyntheticCheckInput): Promise<SyntheticCheck> {
    return this.prisma.syntheticCheck.create({ data: input });
  }

  /** Total vs. successful synthetic checks for one target since a given time — the synthetic half of the availability score (services/availability.ts). */
  async countsSince(target: string, since: Date): Promise<{ total: number; successful: number }> {
    const [total, successful] = await Promise.all([
      this.prisma.syntheticCheck.count({ where: { target, checkedAt: { gte: since } } }),
      this.prisma.syntheticCheck.count({ where: { target, checkedAt: { gte: since }, success: true } }),
    ]);
    return { total, successful };
  }

  /** Batched `countsSince` for several targets at once — grouped in two queries rather than one pair per target. */
  async countsByTargetsSince(targets: string[], since: Date): Promise<Map<string, { total: number; successful: number }>> {
    if (targets.length === 0) return new Map();
    const [totalRows, successRows] = await Promise.all([
      this.prisma.syntheticCheck.groupBy({ by: ['target'], where: { target: { in: targets }, checkedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.syntheticCheck.groupBy({
        by: ['target'],
        where: { target: { in: targets }, checkedAt: { gte: since }, success: true },
        _count: { _all: true },
      }),
    ]);
    const successByTarget = new Map(successRows.map((r) => [r.target, r._count._all]));
    return new Map(totalRows.map((r) => [r.target, { total: r._count._all, successful: successByTarget.get(r.target) ?? 0 }]));
  }

  recentForTarget(target: string, limit = 20): Promise<SyntheticCheck[]> {
    return this.prisma.syntheticCheck.findMany({ where: { target }, orderBy: { checkedAt: 'desc' }, take: limit });
  }
}
