import { z } from 'zod';

/**
 * Spend-cap configuration shared by every surface that enforces an agent's
 * self-declared budget: the TypeScript Agent SDK (client-side, per process)
 * and the MCP tool executor (server-side, per declared session — see
 * apps/api/src/services/mcp-session-budget.ts). One set of semantics, two
 * thin call sites, so "what does perCallUsd mean" only has one answer.
 */
export const BudgetConfigSchema = z.object({
  perCallUsd: z.number().nonnegative().optional(),
  sessionUsd: z.number().nonnegative().optional(),
  dailyUsd: z.number().nonnegative().optional(),
});
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

export type BudgetLimitKind = 'perCall' | 'session' | 'daily';

export interface BudgetCheckResult {
  ok: boolean;
  limit?: BudgetLimitKind;
  limitUsd?: number;
  wouldSpendUsd?: number;
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Tracks cumulative spend against `BudgetConfig` caps. Deliberately
 * non-throwing (`check` returns a result, it doesn't raise) so each call
 * site can surface the violation in its own idiom — the Agent SDK's
 * `BudgetExceededError`, the API's `AppError('BUDGET_EXCEEDED', ...)` — without
 * this shared core depending on either.
 */
export class Budget {
  private sessionSpendUsd = 0;
  private dailySpend = new Map<string, number>();

  constructor(private readonly config: BudgetConfig) {}

  /** Would spending `priceUsd` on `resource` exceed any configured cap? Does not record the spend — call `record` after the call actually succeeds. */
  check(priceUsd: number): BudgetCheckResult {
    if (this.config.perCallUsd !== undefined && priceUsd > this.config.perCallUsd) {
      return { ok: false, limit: 'perCall', limitUsd: this.config.perCallUsd, wouldSpendUsd: priceUsd };
    }

    if (this.config.sessionUsd !== undefined) {
      const wouldSpend = this.sessionSpendUsd + priceUsd;
      if (wouldSpend > this.config.sessionUsd) {
        return { ok: false, limit: 'session', limitUsd: this.config.sessionUsd, wouldSpendUsd: wouldSpend };
      }
    }

    if (this.config.dailyUsd !== undefined) {
      const key = utcDateKey(new Date());
      const wouldSpend = (this.dailySpend.get(key) ?? 0) + priceUsd;
      if (wouldSpend > this.config.dailyUsd) {
        return { ok: false, limit: 'daily', limitUsd: this.config.dailyUsd, wouldSpendUsd: wouldSpend };
      }
    }

    return { ok: true };
  }

  /** Call once a payment actually settles — keeps the caps meaningful even when a call is retried or fails after paying. */
  record(priceUsd: number): void {
    this.sessionSpendUsd += priceUsd;
    const key = utcDateKey(new Date());
    this.dailySpend.set(key, (this.dailySpend.get(key) ?? 0) + priceUsd);
  }

  get spentThisSessionUsd(): number {
    return this.sessionSpendUsd;
  }

  spentTodayUsd(): number {
    return this.dailySpend.get(utcDateKey(new Date())) ?? 0;
  }
}
