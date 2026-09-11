import type { SignalScores } from '../types.js';
import type { RecommendationResult } from './recommendation-engine.js';
import { clamp } from '../utils.js';

/**
 * Confidence blends how decisively the signals agree (the further
 * weightedScore sits from the neutral zone, the more the signals agree
 * with each other) with how complete the underlying data was — a BUY built
 * on 50% of providers should never report the same confidence as one built
 * on 100%.
 */
export function confidenceCalculator(
  _signals: SignalScores,
  recommendation: RecommendationResult,
  dataCompleteness: number,
): number {
  const magnitude = Math.min(Math.abs(recommendation.weightedScore), 100);
  const baseConfidence = 40 + magnitude * 0.5; // 40..90
  const completenessAdjusted = baseConfidence * (0.5 + 0.5 * dataCompleteness);
  return Math.round(clamp(completenessAdjusted, 5, 97));
}
