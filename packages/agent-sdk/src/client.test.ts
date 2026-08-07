import { describe, expect, it, vi } from 'vitest';
import { createFakeServer } from './test-helpers/fake-server.js';
import { Budget } from './budget.js';
import { AgentMarketClient } from './client.js';
import { AllProvidersFailedError, BudgetExceededError, UnsupportedPaymentSchemeError } from './errors.js';
import { createMockPaymentScheme } from './payment/mock-scheme.js';
import type { AgentEvent, AgentMarketClientConfig } from './types.js';

function client(fetchImpl: typeof fetch, overrides: Partial<AgentMarketClientConfig> = {}) {
  return new AgentMarketClient({
    baseUrl: 'http://fake.local',
    paymentScheme: createMockPaymentScheme('AGENT_ADDRESS'),
    fetchImpl,
    retry: { baseDelayMs: 1, maxDelayMs: 5 },
    ...overrides,
  });
}

describe('AgentMarketClient — the 402 -> pay -> 200 loop', () => {
  it('pays for and returns a metered resource', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/sentiment': { priceUsd: 0.02, response: { score: 78, label: 'GREED' } },
    });
    const agent = client(fetchImpl);

    const result = await agent.call<{ score: number }>('/v1/sentiment');
    expect(result.score).toBe(78);
  });

  it('never pays for a free (non-402) resource', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const agent = client(fetchImpl as unknown as typeof fetch);

    await agent.call('/health');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // one call, not the usual probe-then-pay two
  });

  it('records real usage after a successful paid call', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/sentiment': { priceUsd: 0.02, response: { ok: true } },
    });
    const agent = client(fetchImpl);
    await agent.call('/v1/sentiment');

    const summary = agent.getUsageSummary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalSpendUsd).toBeCloseTo(0.02);
    expect(summary.byResource['/v1/sentiment']).toEqual({ calls: 1, spendUsd: 0.02 });
  });

  it('throws UnsupportedPaymentSchemeError for a network the configured scheme cannot pay', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/sentiment': { priceUsd: 0.02, network: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=', response: {} },
    });
    const agent = client(fetchImpl); // configured with the mock scheme only

    await expect(agent.call('/v1/sentiment')).rejects.toBeInstanceOf(UnsupportedPaymentSchemeError);
  });
});

describe('AgentMarketClient — budgets', () => {
  it('refuses to pay for a call over the per-call cap, before ever constructing a payment', async () => {
    const { fetchImpl, attemptsFor } = createFakeServer({
      '/v1/analyze': { priceUsd: 0.05, response: { ok: true } },
    });
    const agent = client(fetchImpl, { budget: { perCallUsd: 0.03 } });

    await expect(agent.call('/v1/analyze')).rejects.toBeInstanceOf(BudgetExceededError);
    expect(attemptsFor('/v1/analyze')).toBe(0); // the 402 probe happened, but payment was never sent
  });

  it('shares a spend cap across two clients given the same Budget instance', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/a': { priceUsd: 0.06, response: { ok: true } },
      '/v1/b': { priceUsd: 0.06, response: { ok: true } },
    });
    const sharedBudget = new Budget({ sessionUsd: 0.1 });
    const agentA = client(fetchImpl, { budget: sharedBudget });
    const agentB = client(fetchImpl, { budget: sharedBudget });

    await agentA.call('/v1/a'); // spends 0.06 of the shared 0.10
    await expect(agentB.call('/v1/b')).rejects.toBeInstanceOf(BudgetExceededError); // would bring shared total to 0.12
  });
});

describe('AgentMarketClient — retries', () => {
  it('retries a transient 500 and succeeds on a later attempt', async () => {
    const { fetchImpl, attemptsFor } = createFakeServer({
      '/v1/flaky': { priceUsd: 0.01, response: { ok: true }, failFirstNAttempts: 2 },
    });
    const agent = client(fetchImpl);

    const result = await agent.call<{ ok: boolean }>('/v1/flaky');
    expect(result.ok).toBe(true);
    expect(attemptsFor('/v1/flaky')).toBe(3);
  });

  it('does not retry a rejected payment signature — surfaces immediately', async () => {
    const { fetchImpl, attemptsFor } = createFakeServer({
      '/v1/bad-pay': { priceUsd: 0.01, response: {}, rejectPayment: true },
    });
    const agent = client(fetchImpl);

    await expect(agent.call('/v1/bad-pay')).rejects.toThrow(/rejection/);
    expect(attemptsFor('/v1/bad-pay')).toBe(1);
  });
});

describe('AgentMarketClient — fallback chains', () => {
  it('falls through to a fallback when the primary resource fails', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/primary': { priceUsd: 0.03, response: {}, rejectPayment: true },
      '/v1/backup': { priceUsd: 0.03, response: { source: 'backup' } },
    });
    const agent = client(fetchImpl);

    const result = await agent.call<{ source: string }>('/v1/primary').fallback('/v1/backup');
    expect(result.source).toBe('backup');
  });

  it('throws AllProvidersFailedError with every attempt recorded when primary and all fallbacks fail', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/primary': { priceUsd: 0.01, response: {}, rejectPayment: true },
      '/v1/backup': { priceUsd: 0.01, response: {}, rejectPayment: true },
    });
    const agent = client(fetchImpl);

    try {
      await agent.call('/v1/primary').fallback('/v1/backup');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AllProvidersFailedError);
      expect((error as AllProvidersFailedError).attempts.map((a) => a.resource)).toEqual(['/v1/primary', '/v1/backup']);
    }
  });

  it('never touches a fallback if the primary succeeds', async () => {
    const { fetchImpl, attemptsFor } = createFakeServer({
      '/v1/primary': { priceUsd: 0.01, response: { ok: true } },
      '/v1/backup': { priceUsd: 0.01, response: { ok: true } },
    });
    const agent = client(fetchImpl);

    await agent.call('/v1/primary').fallback('/v1/backup');
    expect(attemptsFor('/v1/backup')).toBe(0);
  });
});

describe('AgentMarketClient — cost estimation', () => {
  it('reports the real price without paying', async () => {
    const { fetchImpl, attemptsFor } = createFakeServer({
      '/v1/analyze': { priceUsd: 0.05, response: {} },
    });
    const agent = client(fetchImpl);

    const estimate = await agent.estimateCost('/v1/analyze');
    expect(estimate.priceUsd).toBeCloseTo(0.05);
    expect(attemptsFor('/v1/analyze')).toBe(0);
  });
});

describe('AgentMarketClient — response caching', () => {
  it('serves a repeated identical call from cache without a second payment', async () => {
    const { fetchImpl, attemptsFor } = createFakeServer({
      '/v1/sentiment': { priceUsd: 0.02, response: { score: 50 } },
    });
    const agent = client(fetchImpl, { cacheTtlMs: 60_000 });

    await agent.call('/v1/sentiment');
    await agent.call('/v1/sentiment');

    expect(attemptsFor('/v1/sentiment')).toBe(1);
    expect(agent.getUsageSummary().totalCalls).toBe(2);
    expect(agent.getUsageSummary().totalSpendUsd).toBeCloseTo(0.02); // second call was free (served from cache)
  });

  it('bypasses the cache when noCache is set', async () => {
    const { fetchImpl, attemptsFor } = createFakeServer({
      '/v1/sentiment': { priceUsd: 0.02, response: { score: 50 } },
    });
    const agent = client(fetchImpl, { cacheTtlMs: 60_000 });

    await agent.call('/v1/sentiment');
    await agent.call('/v1/sentiment', undefined, { noCache: true });

    expect(attemptsFor('/v1/sentiment')).toBe(2);
  });
});

describe('AgentMarketClient — event stream', () => {
  it('emits a coherent start -> cost_known -> paying -> success sequence', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/sentiment': { priceUsd: 0.02, response: { ok: true } },
    });
    const events: AgentEvent['type'][] = [];
    const agent = client(fetchImpl, { onEvent: (e) => events.push(e.type) });

    await agent.call('/v1/sentiment');
    expect(events).toEqual(['call:start', 'call:cost_known', 'call:paying', 'call:success']);
  });

  it('emits call:fallback when moving to the next resource in a chain', async () => {
    const { fetchImpl } = createFakeServer({
      '/v1/primary': { priceUsd: 0.01, response: {}, rejectPayment: true },
      '/v1/backup': { priceUsd: 0.01, response: { ok: true } },
    });
    const events: AgentEvent[] = [];
    const agent = client(fetchImpl, { onEvent: (e) => events.push(e) });

    await agent.call('/v1/primary').fallback('/v1/backup');
    const fallbackEvent = events.find((e) => e.type === 'call:fallback');
    expect(fallbackEvent).toMatchObject({ type: 'call:fallback', fromResource: '/v1/primary', toResource: '/v1/backup' });
  });
});
