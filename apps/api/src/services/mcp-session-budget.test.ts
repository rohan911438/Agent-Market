import { describe, expect, it } from 'vitest';
import { McpSessionBudgetStore } from './mcp-session-budget.js';

describe('McpSessionBudgetStore', () => {
  it('allows a call within a declared per-call cap when no sessionId is given', () => {
    const store = new McpSessionBudgetStore();
    expect(store.check(undefined, { perCallUsd: 0.1 }, 0.05)).toEqual({ ok: true });
  });

  it('rejects a call over a declared per-call cap when no sessionId is given, without any session state', () => {
    const store = new McpSessionBudgetStore();
    const result = store.check(undefined, { perCallUsd: 0.05 }, 0.06);
    expect(result).toMatchObject({ ok: false, limit: 'perCall' });
  });

  it('establishes a session cap on first use and accumulates spend against it', () => {
    const store = new McpSessionBudgetStore();
    expect(store.check('s1', { sessionUsd: 0.1 }, 0.06)).toEqual({ ok: true });
    store.record('s1', 0.06);
    expect(store.check('s1', {}, 0.06)).toMatchObject({ ok: false, limit: 'session' });
  });

  it('does not let a later call loosen an already-established session cap', () => {
    const store = new McpSessionBudgetStore();
    store.check('s1', { sessionUsd: 0.05 }, 0.05);
    store.record('s1', 0.05);
    // A later call declaring a bigger cap for the same session must not raise it.
    const result = store.check('s1', { sessionUsd: 100 }, 0.01);
    expect(result).toMatchObject({ ok: false, limit: 'session' });
  });

  it('never records spend for a call with no sessionId', () => {
    const store = new McpSessionBudgetStore();
    store.record(undefined, 0.5);
    expect(store.check(undefined, { perCallUsd: 0.01 }, 0.02)).toMatchObject({ ok: false });
  });

  it('keeps separate sessions independent', () => {
    const store = new McpSessionBudgetStore();
    store.check('a', { sessionUsd: 0.05 }, 0.05);
    store.record('a', 0.05);
    expect(store.check('b', { sessionUsd: 0.05 }, 0.05)).toEqual({ ok: true });
  });
});
