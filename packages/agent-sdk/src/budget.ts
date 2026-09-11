import { BudgetExceededError } from './errors.js';
import type { BudgetConfig } from './types.js';

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Tracks cumulative spend against `BudgetConfig` caps. Stateful and mutable
 * on purpose: construct one `Budget` and pass the *same instance* to several
 * `AgentMarketClient`s (or wrap it — a swarm coordinator, a sub-agent
 * factory) to give them a shared spending ceiling instead of each enforcing
 * its own independent cap. See `createSharedBudget`.
 */
export class Budget {
  private sessionSpendUsd = 0;
  private dailySpend = new Map<string, number>();

  constructor(private readonly config: BudgetConfig) {}

  /** Throws BudgetExceededError if spending `priceUsd` on `resource` would exceed any configured cap. Does not record the spend — call `record` after the call actually succeeds. */
  check(resource: string, priceUsd: number): void {
    if (this.config.perCallUsd !== undefined && priceUsd > this.config.perCallUsd) {
      throw new BudgetExceededError('perCall', this.config.perCallUsd, priceUsd, resource);
    }

    if (this.config.sessionUsd !== undefined) {
      const wouldSpend = this.sessionSpendUsd + priceUsd;
      if (wouldSpend > this.config.sessionUsd) {
        throw new BudgetExceededError('session', this.config.sessionUsd, wouldSpend, resource);
      }
    }

    if (this.config.dailyUsd !== undefined) {
      const key = utcDateKey(new Date());
      const wouldSpend = (this.dailySpend.get(key) ?? 0) + priceUsd;
      if (wouldSpend > this.config.dailyUsd) {
        throw new BudgetExceededError('daily', this.config.dailyUsd, wouldSpend, resource);
      }
    }
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

/**
 * One Budget, many agents. `agent.factor(1/3)` style splitting isn't
 * provided — pass the identical returned instance to every client that
 * should draw from the same pool; `Budget` is mutated in place so all
 * holders see each other's spend immediately.
 */
export function createSharedBudget(config: BudgetConfig): Budget {
  return new Budget(config);
}
