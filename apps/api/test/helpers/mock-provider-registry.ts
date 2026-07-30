import { ApiProviderRegistry } from '@agentmarket/providers';

/** Deterministic, offline provider registry for tests — no network calls. */
export function buildMockProviderRegistry(): ApiProviderRegistry {
  return new ApiProviderRegistry({
    priceProviders: [
      {
        name: 'test-price',
        isAvailable: () => true,
        execute: async ({ symbol }: { symbol: string }) => ({
          symbol,
          priceUsd: 100,
          change24hPct: 5,
          volume24hUsd: 50_000_000,
          marketCapUsd: 1_000_000_000,
          source: 'test-price',
        }),
      },
    ],
    ohlcProviders: [
      {
        name: 'test-ohlc',
        isAvailable: () => true,
        execute: async ({ symbol }: { symbol: string }) => ({
          symbol,
          candles: [
            { timestamp: 1, open: 95, high: 101, low: 94, close: 100 },
            { timestamp: 2, open: 100, high: 108, low: 99, close: 105 },
            { timestamp: 3, open: 105, high: 112, low: 104, close: 110 },
          ],
          source: 'test-ohlc',
        }),
      },
    ],
    fearGreedProviders: [
      {
        name: 'test-feargreed',
        isAvailable: () => true,
        execute: async () => ({ value: 70, label: 'Greed', source: 'test-feargreed' }),
      },
    ],
    trendingProviders: [
      {
        name: 'test-trending',
        isAvailable: () => true,
        execute: async ({ limit }: { limit: number }) =>
          Array.from({ length: limit }, (_, i) => ({
            symbol: `COIN${i}`,
            rank: i + 1,
            priceUsd: 10 + i,
            change24hPct: 2,
          })),
      },
    ],
  });
}
