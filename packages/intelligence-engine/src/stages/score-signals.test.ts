import { describe, expect, it } from 'vitest';
import { scoreSignals } from './score-signals.js';
import type { MarketSnapshot } from '../types.js';

function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: 'BTC',
    priceUsd: 100,
    change24hPct: 0,
    volume24hUsd: 500_000_000,
    marketCapUsd: 2_000_000_000,
    sourcesUsed: ['test'],
    dataCompleteness: 1,
    ...overrides,
  };
}

describe('scoreSignals', () => {
  it('reports UPTREND with positive momentum for a rising candle series', () => {
    const candles = [
      { timestamp: 1, open: 100, high: 101, low: 99, close: 100 },
      { timestamp: 2, open: 100, high: 106, low: 100, close: 105 },
      { timestamp: 3, open: 105, high: 112, low: 105, close: 110 },
    ];
    const signals = scoreSignals(snapshot({ candles }));
    expect(signals.trendDirection).toBe('UPTREND');
    expect(signals.momentum).toBeGreaterThan(0);
  });

  it('reports DOWNTREND with negative momentum for a falling candle series', () => {
    const candles = [
      { timestamp: 1, open: 110, high: 111, low: 104, close: 110 },
      { timestamp: 2, open: 110, high: 110, low: 104, close: 105 },
      { timestamp: 3, open: 105, high: 105, low: 99, close: 100 },
    ];
    const signals = scoreSignals(snapshot({ candles }));
    expect(signals.trendDirection).toBe('DOWNTREND');
    expect(signals.momentum).toBeLessThan(0);
  });

  it('falls back to change24hPct when candles are unavailable', () => {
    const signals = scoreSignals(snapshot({ candles: undefined, change24hPct: 10 }));
    expect(signals.momentum).toBe(50);
  });

  it('scores liquidity higher for larger volume', () => {
    const low = scoreSignals(snapshot({ volume24hUsd: 500_000 }));
    const high = scoreSignals(snapshot({ volume24hUsd: 2_000_000_000 }));
    expect(high.liquidity).toBeGreaterThan(low.liquidity);
  });

  it('defaults sentiment to the fear/greed index when no news sentiment is present', () => {
    const signals = scoreSignals(snapshot({ fearGreedIndex: 80, newsSentiment: null }));
    expect(signals.sentiment).toBe(80);
  });

  it('keeps all scores within their documented bounds', () => {
    const signals = scoreSignals(snapshot({ change24hPct: 500, volume24hUsd: 0, fearGreedIndex: 0 }));
    expect(signals.momentum).toBeGreaterThanOrEqual(-100);
    expect(signals.momentum).toBeLessThanOrEqual(100);
    expect(signals.volatility).toBeGreaterThanOrEqual(0);
    expect(signals.volatility).toBeLessThanOrEqual(100);
    expect(signals.liquidity).toBeGreaterThanOrEqual(0);
    expect(signals.liquidity).toBeLessThanOrEqual(100);
  });
});
