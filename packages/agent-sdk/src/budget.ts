import { Budget as CoreBudget, type BudgetConfig } from '@rohankumar4179/shared-types';
import { BudgetExceededError } from './errors.js';

/**
 * Tracks cumulative spend against `BudgetConfig` caps. Stateful and mutable
 * on purpose: construct one `Budget` and pass the *same instance* to several
 * `AgentMarketClient`s (or wrap it — a swarm coordinator, a sub-agent
 * factory) to give them a shared spending ceiling instead of each enforcing
 * its own independent cap. See `createSharedBudget`.
 *
 * The cap arithmetic itself lives in `@rohankumar4179/shared-types`'s
 * `Budget` — shared with the MCP tool executor (apps/api/src/services/
 * mcp-session-budget.ts) so "what does perCallUsd mean" has exactly one
 * answer. This class is a thin adaptor that keeps this SDK's existing
 * throwing API (`check` throws `BudgetExceededError`) unchanged for callers.
 */
export class Budget {
  private readonly core: CoreBudget;

  constructor(config: BudgetConfig) {
    this.core = new CoreBudget(config);
  }

  /** Throws BudgetExceededError if spending `priceUsd` on `resource` would exceed any configured cap. Does not record the spend — call `record` after the call actually succeeds. */
  check(resource: string, priceUsd: number): void {
    const result = this.core.check(priceUsd);
    if (!result.ok) {
      throw new BudgetExceededError(result.limit!, result.limitUsd!, result.wouldSpendUsd!, resource);
    }
  }

  /** Call once a payment actually settles — keeps the caps meaningful even when a call is retried or fails after paying. */
  record(priceUsd: number): void {
    this.core.record(priceUsd);
  }

  get spentThisSessionUsd(): number {
    return this.core.spentThisSessionUsd;
  }

  spentTodayUsd(): number {
    return this.core.spentTodayUsd();
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
