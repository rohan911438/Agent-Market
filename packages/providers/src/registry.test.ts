import { describe, expect, it, vi } from 'vitest';
import { ApiProviderRegistry } from './registry.js';
import type { PriceProviderAdapter } from './types.js';

function mockProvider(name: string, impl: () => Promise<{ symbol: string; priceUsd: number; change24hPct: number; volume24hUsd: number; source: string }>, available = true): PriceProviderAdapter {
  return {
    name,
    isAvailable: () => available,
    execute: impl,
  };
}

describe('ApiProviderRegistry', () => {
  it('falls through to the next provider on failure', async () => {
    const failing = mockProvider('failing', () => Promise.reject(new Error('boom')));
    const working = mockProvider('working', () =>
      Promise.resolve({ symbol: 'BTC', priceUsd: 100, change24hPct: 1, volume24hUsd: 1, source: 'working' }),
    );
    const registry = new ApiProviderRegistry({ priceProviders: [failing, working] });

    const result = await registry.fetchPrice('BTC');
    expect(result?.source).toBe('working');
  });

  it('skips unavailable providers entirely', async () => {
    const unavailable = mockProvider('unavailable', () => Promise.resolve({ symbol: 'BTC', priceUsd: 1, change24hPct: 0, volume24hUsd: 0, source: 'unavailable' }), false);
    const working = mockProvider('working', () => Promise.resolve({ symbol: 'BTC', priceUsd: 2, change24hPct: 0, volume24hUsd: 0, source: 'working' }));
    const registry = new ApiProviderRegistry({ priceProviders: [unavailable, working] });

    const result = await registry.fetchPrice('BTC');
    expect(result?.source).toBe('working');
  });

  it('returns undefined (partial/no data) when every provider fails, never throws', async () => {
    const registry = new ApiProviderRegistry({
      priceProviders: [
        mockProvider('a', () => Promise.reject(new Error('a down'))),
        mockProvider('b', () => Promise.reject(new Error('b down'))),
      ],
    });

    await expect(registry.fetchPrice('BTC')).resolves.toBeUndefined();
  });

  it('opens the circuit after repeated failures and skips the provider without calling it', async () => {
    const spy = vi.fn(() => Promise.reject(new Error('down')));
    const flaky = mockProvider('flaky', spy);
    const fallback = mockProvider('fallback', () => Promise.resolve({ symbol: 'BTC', priceUsd: 1, change24hPct: 0, volume24hUsd: 0, source: 'fallback' }));
    const registry = new ApiProviderRegistry({ priceProviders: [flaky, fallback], failureThreshold: 2, cooldownMs: 60_000 });

    await registry.fetchPrice('BTC');
    await registry.fetchPrice('BTC');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(registry.isCircuitOpen('flaky')).toBe(true);

    await registry.fetchPrice('BTC');
    expect(spy).toHaveBeenCalledTimes(2); // circuit open — not called a 3rd time
  });
});
