import type { UsageRecord, UsageSummary } from './types.js';

/** Client-side call log — separate from (and much cheaper to query than) the server's own /v1/dashboard, since it's just this process's in-memory history. */
export class UsageTracker {
  private records: UsageRecord[] = [];

  record(entry: UsageRecord): void {
    this.records.push(entry);
  }

  summary(): UsageSummary {
    const byResource: UsageSummary['byResource'] = {};
    let totalSpendUsd = 0;

    for (const r of this.records) {
      totalSpendUsd += r.priceUsd;
      const bucket = byResource[r.resource] ?? { calls: 0, spendUsd: 0 };
      bucket.calls += 1;
      bucket.spendUsd += r.priceUsd;
      byResource[r.resource] = bucket;
    }

    return { totalCalls: this.records.length, totalSpendUsd, byResource };
  }

  history(): readonly UsageRecord[] {
    return this.records;
  }

  clear(): void {
    this.records = [];
  }
}
