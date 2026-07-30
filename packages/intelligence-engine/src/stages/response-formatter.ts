import type { AnalyzeResponse, ResponseMeta, SentimentLabel } from '@agentmarket/shared-types';
import type { Explanation } from '../explainers/explainer.interface.js';
import type { MarketSnapshot, SignalScores } from '../types.js';
import type { RecommendationResult } from './recommendation-engine.js';
import type { RiskAssessment } from './risk-assessor.js';

export function sentimentLabel(score: number): SentimentLabel {
  if (score <= 20) return 'EXTREME_FEAR';
  if (score <= 40) return 'FEAR';
  if (score <= 60) return 'NEUTRAL';
  if (score <= 80) return 'GREED';
  return 'EXTREME_GREED';
}

export function formatAnalyzeResponse(params: {
  snapshot: MarketSnapshot;
  signals: SignalScores;
  recommendation: RecommendationResult;
  risk: RiskAssessment;
  confidence: number;
  explanation: Explanation;
  meta: ResponseMeta;
}): AnalyzeResponse {
  return {
    symbol: params.snapshot.symbol,
    action: params.recommendation.action,
    confidence: params.confidence,
    risk: params.risk.riskLevel,
    reason: params.explanation.reason,
    marketSummary: params.explanation.marketSummary,
    liquidityScore: params.signals.liquidity,
    volatility: params.signals.volatility,
    sentiment: { score: params.signals.sentiment, label: sentimentLabel(params.signals.sentiment) },
    technicalSummary: params.explanation.technicalSummary,
    recommendation: params.explanation.recommendation,
    meta: params.meta,
  };
}
