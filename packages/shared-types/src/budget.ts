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

/** Plain-object snapshot of a Budget's accumulated spend — see `Budget.toJSON()`/the constructor's second argument. Round-trips through any store that only holds JSON (a cache, a DB row). */
export interface BudgetState {
  sessionSpendUsd: number;
  /** UTC date key (YYYY-MM-DD) -> spend that day. */
  dailySpend: Record<string, number>;
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
 *
 * Holds its accumulated spend in memory, but that spend is fully
 * serializable via `toJSON()`/the constructor's optional second argument —
 * a caller that can't keep one long-lived `Budget` instance around (e.g. a
 * server handling one MCP session across many separate stateless requests,
 * backed by a cache/DB row instead of a live object) reconstructs one from
 * its last known state, calls `check`/`record`, and persists `toJSON()`
 * back. See apps/api/src/services/mcp-session-budget.ts for the real
 * example.
 */
export class Budget {
  private sessionSpendUsd: number;
  private dailySpend: Map<string, number>;

  constructor(
    private readonly config: BudgetConfig,
    initialState?: BudgetState,
  ) {
    this.sessionSpendUsd = initialState?.sessionSpendUsd ?? 0;
    this.dailySpend = new Map(Object.entries(initialState?.dailySpend ?? {}));
  }

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

  /** Snapshot suitable for JSON storage — pass back into the constructor's second argument to resume. */
  toJSON(): BudgetState {
    return { sessionSpendUsd: this.sessionSpendUsd, dailySpend: Object.fromEntries(this.dailySpend) };
  }
}
