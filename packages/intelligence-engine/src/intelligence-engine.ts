import type { ApiProviderRegistry } from '@agentmarket/providers';
import type { AnalyzeResponse, ResponseMeta } from '@agentmarket/shared-types';
import type { Explainer } from './explainers/explainer.interface.js';
import { collectMarketData } from './stages/collect-market-data.js';
import { confidenceCalculator } from './stages/confidence-calculator.js';
import { mergeSources } from './stages/merge-sources.js';
import { normalizeInput } from './stages/normalize-input.js';
import { recommendationEngine } from './stages/recommendation-engine.js';
import { formatAnalyzeResponse } from './stages/response-formatter.js';
import { riskAssessor } from './stages/risk-assessor.js';
import { scoreSignals } from './stages/score-signals.js';
import type { MarketSnapshot, SignalScores } from './types.js';

export interface AnalyzeParams {
  symbol: string;
  timeframe?: string;
  requestId: string;
}

export interface SnapshotAndSignals {
  snapshot: MarketSnapshot;
  signals: SignalScores;
}

/**
 * Orchestrates the full request -> normalize -> collect -> merge -> score ->
 * recommend -> confidence -> explain -> format pipeline. Every stage is a
 * standalone, independently-tested pure function/class; this class only
 * sequences them.
 */
export class IntelligenceEngine {
  constructor(
    private readonly registry: ApiProviderRegistry,
    private readonly explainer: Explainer,
  ) {}

  /** Full flagship /analyze response. */
  async analyze(params: AnalyzeParams): Promise<AnalyzeResponse> {
    const start = Date.now();
    const { snapshot, signals } = await this.computeSnapshotAndSignals(params.symbol, params.timeframe);

    const recommendation = recommendationEngine(signals);
    const risk = riskAssessor(signals, snapshot.dataCompleteness);
    const confidence = confidenceCalculator(signals, recommendation, snapshot.dataCompleteness);
    const explanation = this.explainer.explain({ snapshot, signals, recommendation, risk, confidence });

    const meta: ResponseMeta = {
      requestId: params.requestId,
      timestamp: new Date().toISOString(),
      status: 'live',
      cacheHit: false,
      providers: snapshot.sourcesUsed,
      latencyMs: Date.now() - start,
    };

    return formatAnalyzeResponse({ snapshot, signals, recommendation, risk, confidence, explanation, meta });
  }

  /**
   * Runs normalize -> collect -> merge -> score without the explanation/
   * formatting steps, so /market-summary, /sentiment, /risk-analysis, and
   * /execution-readiness can build their own response shapes from the same
   * underlying computation instead of duplicating provider-fetch logic.
   */
  async computeSnapshotAndSignals(symbol: string, timeframe?: string): Promise<SnapshotAndSignals> {
    const input = normalizeInput({ symbol, timeframe });
    const raw = await collectMarketData(this.registry, input.symbol, input.timeframe);
    const snapshot = mergeSources(raw);
    const signals = scoreSignals(snapshot);
    return { snapshot, signals };
  }

  computeRisk(signals: SignalScores, dataCompleteness: number) {
    return riskAssessor(signals, dataCompleteness);
  }
}
