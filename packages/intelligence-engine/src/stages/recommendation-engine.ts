import type { Action } from '@rohankumar4179/shared-types';
import type { SignalScores } from '../types.js';

export interface RecommendationResult {
  action: Action;
  /** -100..100 composite score; the number the BUY/SELL/HOLD thresholds are applied to. */
  weightedScore: number;
}

const WEIGHTS = { momentum: 0.35, sentiment: 0.25, trend: 0.25, liquidity: 0.15 } as const;
const BUY_THRESHOLD = 20;
const SELL_THRESHOLD = -20;

/** Deterministic weighted-threshold decision — no LLM call, fully reproducible and testable. */
export function recommendationEngine(signals: SignalScores): RecommendationResult {
  const sentimentCentered = (signals.sentiment - 50) * 2; // -100..100
  const liquidityCentered = (signals.liquidity - 50) * 2; // -100..100
  const trendSigned = signals.trendDirection === 'DOWNTREND' ? -signals.trendStrength : signals.trendStrength;

  const weightedScore =
    signals.momentum * WEIGHTS.momentum +
    sentimentCentered * WEIGHTS.sentiment +
    trendSigned * WEIGHTS.trend +
    liquidityCentered * WEIGHTS.liquidity;

  let action: Action = 'HOLD';
  if (weightedScore >= BUY_THRESHOLD) action = 'BUY';
  else if (weightedScore <= SELL_THRESHOLD) action = 'SELL';

  return { action, weightedScore: Math.round(weightedScore) };
}
