import { describe, expect, it } from 'vitest';
import { riskAssessor } from './risk-assessor.js';
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

describe('riskAssessor', () => {
  it('flags HIGH risk for high volatility and thin liquidity', () => {
    const result = riskAssessor(signals({ volatility: 90, liquidity: 10 }), 1);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.factors).toContain('High recent price volatility');
    expect(result.factors).toContain('Thin liquidity increases slippage risk');
  });

  it('flags LOW risk for calm, liquid conditions', () => {
    const result = riskAssessor(signals({ volatility: 5, liquidity: 95 }), 1);
    expect(result.riskLevel).toBe('LOW');
  });

  it('penalizes incomplete upstream data', () => {
    const complete = riskAssessor(signals(), 1);
    const partial = riskAssessor(signals(), 0.25);
    expect(partial.riskScore).toBeGreaterThan(complete.riskScore);
    expect(partial.factors).toContain('Response built from partial upstream data');
  });

  it('never returns an empty factors list', () => {
    const result = riskAssessor(signals({ volatility: 5, liquidity: 95 }), 1);
    expect(result.factors.length).toBeGreaterThan(0);
  });
});
