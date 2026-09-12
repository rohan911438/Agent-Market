import type { ICache } from '@agentmarket/cache';
import { Budget, type BudgetCheckResult, type BudgetConfig, type BudgetState } from '@rohankumar4179/shared-types';

const SESSION_TTL_SECONDS = 60 * 60;

interface StoredSession {
  /** Fixed by whichever call first establishes this sessionId — see the class docstring. */
  config: BudgetConfig;
  state: BudgetState;
}

function keyFor(sessionId: string): string {
  return `mcp-session-budget:${sessionId}`;
}

/**
 * Server-side enforcement of an MCP caller's self-declared spend caps (Phase
 * "MCP Agent-Native Interface" / Budget Control) — the one new piece of
 * server-held state this phase introduces, everything else reuses existing
 * infra untouched.
 *
 * Sessions are the MCP tool-call arguments' own `_agentmarket.sessionId` (an
 * opaque, client-chosen string — no relationship to the MCP transport's own
 * session concept, which stays untouched/stateless — see mcp.route.ts), NOT
 * a database row. State lives in the shared `ICache` (MemoryCache by
 * default, Redis-backed once `CACHE_DRIVER=redis` is set) — the exact same
 * pattern `RateLimiterService` already uses for cross-instance counters
 * (see rate-limiter.ts) — so a session's budget now survives a restart and
 * is shared correctly across horizontally-scaled API instances, closing the
 * limitation the MCP docs previously called out. The *authoritative* spend
 * ceiling remains the per-wallet daily cap already enforced in
 * middleware/x402-payment.ts, which is DB-backed independently of this;
 * this is an additional, agent-declared soft ceiling scoped to one MCP
 * session's declared intent, layered on top.
 *
 * A session's caps are fixed by whichever call first establishes that
 * sessionId — a later call reusing the same sessionId cannot loosen (or
 * tighten) them by resending different numbers. Without this, an agent (or
 * anything replaying its traffic) could trivially raise its own ceiling
 * mid-session by just declaring a bigger number on the next call.
 */
export class McpSessionBudgetStore {
  constructor(private readonly cache: ICache) {}

  /**
   * Checks `priceUsd` against `sessionId`'s caps (established — or created,
   * from `config` — by this call if new, and persisted immediately so a
   * later call can't observe "no session yet" and declare a looser cap).
   * Without a `sessionId`, only `config.perCallUsd` is meaningful (there is
   * nothing to accumulate across calls that share no session key).
   */
  async check(sessionId: string | undefined, config: BudgetConfig, priceUsd: number): Promise<BudgetCheckResult> {
    if (!sessionId) {
      if (config.perCallUsd !== undefined && priceUsd > config.perCallUsd) {
        return { ok: false, limit: 'perCall', limitUsd: config.perCallUsd, wouldSpendUsd: priceUsd };
      }
      return { ok: true };
    }

    const key = keyFor(sessionId);
    let stored = await this.cache.get<StoredSession>(key);
    if (!stored) {
      stored = { config, state: { sessionSpendUsd: 0, dailySpend: {} } };
      await this.cache.set(key, stored, SESSION_TTL_SECONDS);
    }

    return new Budget(stored.config, stored.state).check(priceUsd);
  }

  /** Call once a payment actually settles for a tool call that declared `sessionId`. No-ops if `check` never established this session. */
  async record(sessionId: string | undefined, priceUsd: number): Promise<void> {
    if (!sessionId) return;
    const key = keyFor(sessionId);
    const stored = await this.cache.get<StoredSession>(key);
    if (!stored) return;

    const budget = new Budget(stored.config, stored.state);
    budget.record(priceUsd);
    await this.cache.set(key, { config: stored.config, state: budget.toJSON() }, SESSION_TTL_SECONDS);
  }
}
