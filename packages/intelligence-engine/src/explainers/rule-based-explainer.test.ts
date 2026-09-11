import { describe, expect, it } from 'vitest';
import { RuleBasedExplainer } from './rule-based-explainer.js';
import type { MarketSnapshot, SignalScores } from '../types.js';
import type { RecommendationResult } from '../stages/recommendation-engine.js';
import type { RiskAssessment } from '../stages/risk-assessor.js';

const snapshot: MarketSnapshot = {
  symbol: 'BTC',
  priceUsd: 65000,
  change24hPct: 4.2,
  volume24hUsd: 900_000_000,
  marketCapUsd: 1_200_000_000_000,
  fearGreedIndex: 78,
  sourcesUsed: ['coingecko', 'alternative-me'],
  dataCompleteness: 1,
};

const signals: SignalScores = {
  momentum: 40,
  volatility: 30,
  liquidity: 85,
  sentiment: 78,
  trendStrength: 60,
  trendDirection: 'UPTREND',
};

const recommendation: RecommendationResult = { action: 'BUY', weightedScore: 45 };
const risk: RiskAssessment = { riskLevel: 'LOW', riskScore: 20, drawdownRiskPct: 15, factors: ['No elevated risk factors detected'] };

describe('RuleBasedExplainer', () => {
  it('produces a non-empty, human-readable reason array explaining the WHY', () => {
    const explainer = new RuleBasedExplainer();
    const explanation = explainer.explain({ snapshot, signals, recommendation, risk, confidence: 80 });

    expect(explanation.reason.length).toBeGreaterThan(0);
    expect(explanation.reason.some((r) => r.toLowerCase().includes('momentum'))).toBe(true);
    expect(explanation.reason.some((r) => r.toLowerCase().includes('sentiment') || r.toLowerCase().includes('greedy'))).toBe(true);
    expect(explanation.marketSummary).toContain('BTC');
    expect(explanation.recommendation).toContain('LOW');
  });

  it('mentions partial data when dataCompleteness is below 1', () => {
    const explainer = new RuleBasedExplainer();
    const explanation = explainer.explain({
      snapshot: { ...snapshot, dataCompleteness: 0.5 },
      signals,
      recommendation,
      risk,
      confidence: 60,
    });
    expect(explanation.reason.some((r) => r.includes('partial data'))).toBe(true);
  });
});
