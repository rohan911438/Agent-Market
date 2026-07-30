import type { MarketSnapshot, SignalScores } from '../types.js';
import type { RecommendationResult } from '../stages/recommendation-engine.js';
import type { RiskAssessment } from '../stages/risk-assessor.js';
import type { Explainer, Explanation, ExplanationInput } from './explainer.interface.js';

function formatPrice(value: number): string {
  return value >= 1 ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value.toPrecision(4);
}

function buildMarketSummary(snapshot: MarketSnapshot): string {
  const price = snapshot.priceUsd !== undefined ? `$${formatPrice(snapshot.priceUsd)}` : 'price unavailable';
  const change =
    snapshot.change24hPct !== undefined
      ? `${snapshot.change24hPct >= 0 ? '+' : ''}${snapshot.change24hPct.toFixed(2)}% (24h)`
      : '24h change unavailable';
  return `${snapshot.symbol} is trading at ${price}, ${change}.`;
}

function buildTechnicalSummary(signals: SignalScores): string {
  return `Trend: ${signals.trendDirection} (strength ${signals.trendStrength}/100). Momentum score ${signals.momentum}. Volatility ${signals.volatility}/100.`;
}

function buildRecommendationText(recommendation: RecommendationResult, risk: RiskAssessment): string {
  const actionText: Record<RecommendationResult['action'], string> = {
    BUY: 'Consider accumulating',
    SELL: 'Consider reducing exposure',
    HOLD: 'Hold current position',
  };
  return `${actionText[recommendation.action]}. Risk level: ${risk.riskLevel}.`;
}

/** Deterministic, dependency-free reasoning generator. No LLM key required. */
export class RuleBasedExplainer implements Explainer {
  explain({ snapshot, signals, recommendation, risk }: ExplanationInput): Explanation {
    const reason: string[] = [];

    if (signals.momentum > 20) {
      reason.push(`Strong upward momentum (+${signals.momentum} score) over the analysis window`);
    } else if (signals.momentum < -20) {
      reason.push(`Strong downward momentum (${signals.momentum} score) over the analysis window`);
    } else {
      reason.push('Price momentum is roughly neutral');
    }

    if (signals.sentiment >= 65) {
      reason.push(`Market sentiment is greedy (Fear & Greed ${snapshot.fearGreedIndex ?? '—'}/100)`);
    } else if (signals.sentiment <= 35) {
      reason.push(`Market sentiment is fearful (Fear & Greed ${snapshot.fearGreedIndex ?? '—'}/100)`);
    } else {
      reason.push('Market sentiment is neutral');
    }

    if (signals.trendStrength >= 50 && signals.trendDirection !== 'SIDEWAYS') {
      reason.push(
        `Consistent ${signals.trendDirection.toLowerCase()} detected (trend strength ${signals.trendStrength}/100)`,
      );
    }

    if (signals.liquidity >= 70) {
      reason.push('Deep liquidity supports efficient execution');
    } else if (signals.liquidity <= 30) {
      reason.push('Liquidity is thin — expect higher slippage');
    }

    if (risk.riskLevel === 'HIGH') {
      reason.push('Elevated volatility raises short-term risk');
    }

    if (snapshot.dataCompleteness < 1) {
      reason.push(`Response built from partial data (${Math.round(snapshot.dataCompleteness * 100)}% of sources available)`);
    }

    return {
      reason,
      marketSummary: buildMarketSummary(snapshot),
      technicalSummary: buildTechnicalSummary(signals),
      recommendation: buildRecommendationText(recommendation, risk),
    };
  }
}
