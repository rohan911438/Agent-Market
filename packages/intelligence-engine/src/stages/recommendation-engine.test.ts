import { describe, expect, it } from 'vitest';
import { recommendationEngine } from './recommendation-engine.js';
import type { SignalScores } from '../types.js';

function signals(overrides: Partial<SignalScores> = {}): SignalScores {
  return {
    momentum: 0,
    volatility: 50,
    liquidity: 50,
    sentiment: 50,
    trendStrength: 0,
    trendDirection: 'SIDEWAYS',
    ...overrides,
  };
}

describe('recommendationEngine', () => {
  it('recommends BUY when signals strongly agree on the upside', () => {
    const result = recommendationEngine(
      signals({ momentum: 80, sentiment: 80, trendStrength: 80, trendDirection: 'UPTREND', liquidity: 80 }),
    );
    expect(result.action).toBe('BUY');
  });

  it('recommends SELL when signals strongly agree on the downside', () => {
    const result = recommendationEngine(
      signals({ momentum: -80, sentiment: 20, trendStrength: 80, trendDirection: 'DOWNTREND', liquidity: 20 }),
    );
    expect(result.action).toBe('SELL');
  });

  it('recommends HOLD when signals are neutral', () => {
    const result = recommendationEngine(signals());
    expect(result.action).toBe('HOLD');
  });

  it('is deterministic — identical input always yields identical output', () => {
    const input = signals({ momentum: 42, sentiment: 61, trendStrength: 30, trendDirection: 'UPTREND' });
    expect(recommendationEngine(input)).toEqual(recommendationEngine(input));
  });
});
