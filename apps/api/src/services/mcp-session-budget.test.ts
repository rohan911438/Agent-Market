import { createCache } from '@agentmarket/cache';
import { describe, expect, it } from 'vitest';
import { McpSessionBudgetStore } from './mcp-session-budget.js';

// A real MemoryCache — same ICache contract the production store runs
// against under CACHE_DRIVER=redis, so these tests exercise the actual
// serialize/deserialize round-trip through a store, not an in-process Map.
function buildStore(): McpSessionBudgetStore {
  return new McpSessionBudgetStore(createCache('memory'));
}

describe('McpSessionBudgetStore', () => {
  it('allows a call within a declared per-call cap when no sessionId is given', async () => {
    const store = buildStore();
    expect(await store.check(undefined, { perCallUsd: 0.1 }, 0.05)).toEqual({ ok: true });
  });

  it('rejects a call over a declared per-call cap when no sessionId is given, without any session state', async () => {
    const store = buildStore();
    const result = await store.check(undefined, { perCallUsd: 0.05 }, 0.06);
    expect(result).toMatchObject({ ok: false, limit: 'perCall' });
  });

  it('establishes a session cap on first use and accumulates spend against it', async () => {
    const store = buildStore();
    expect(await store.check('s1', { sessionUsd: 0.1 }, 0.06)).toEqual({ ok: true });
    await store.record('s1', 0.06);
    expect(await store.check('s1', {}, 0.06)).toMatchObject({ ok: false, limit: 'session' });
  });

  it('does not let a later call loosen an already-established session cap', async () => {
    const store = buildStore();
    await store.check('s1', { sessionUsd: 0.05 }, 0.05);
    await store.record('s1', 0.05);
    // A later call declaring a bigger cap for the same session must not raise it.
    const result = await store.check('s1', { sessionUsd: 100 }, 0.01);
    expect(result).toMatchObject({ ok: false, limit: 'session' });
  });

  it('never records spend for a call with no sessionId', async () => {
    const store = buildStore();
    await store.record(undefined, 0.5);
    expect(await store.check(undefined, { perCallUsd: 0.01 }, 0.02)).toMatchObject({ ok: false });
  });

  it('keeps separate sessions independent', async () => {
    const store = buildStore();
    await store.check('a', { sessionUsd: 0.05 }, 0.05);
    await store.record('a', 0.05);
    expect(await store.check('b', { sessionUsd: 0.05 }, 0.05)).toEqual({ ok: true });
  });

  it('survives being reconstructed against the same cache — the multi-instance/restart case', async () => {
    const cache = createCache('memory');
    const first = new McpSessionBudgetStore(cache);
    await first.check('durable', { sessionUsd: 0.1 }, 0.06);
    await first.record('durable', 0.06);

    // A brand-new store instance, as a second API process (or the same
    // process after a restart) would construct — no shared in-memory state
    // with `first`, only the cache.
    const second = new McpSessionBudgetStore(cache);
    const result = await second.check('durable', {}, 0.06);
    expect(result).toMatchObject({ ok: false, limit: 'session' });
  });
});
