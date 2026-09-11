import type { MarketSnapshot, SignalScores } from '../types.js';
import type { RecommendationResult } from '../stages/recommendation-engine.js';
import type { RiskAssessment } from '../stages/risk-assessor.js';

export interface ExplanationInput {
  snapshot: MarketSnapshot;
  signals: SignalScores;
  recommendation: RecommendationResult;
  risk: RiskAssessment;
  confidence: number;
}

export interface Explanation {
  reason: string[];
  marketSummary: string;
  technicalSummary: string;
  recommendation: string;
}

/**
 * Turns scored signals into human-readable reasoning. `RuleBasedExplainer`
 * is the Phase 1 implementation (deterministic, no external call). An
 * `LLMExplainer` implementing this same interface can be swapped in later
 * via `IntelligenceEngine`'s constructor with zero changes to the pipeline.
 */
export interface Explainer {
  explain(input: ExplanationInput): Explanation;
}
