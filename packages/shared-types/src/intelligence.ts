import { z } from 'zod';
import {
  ActionSchema,
  ResponseMetaSchema,
  RiskLevelSchema,
  SentimentLabelSchema,
  SymbolSchema,
  TimeframeSchema,
} from './common.js';

/* ------------------------------------------------------------------ */
/* Shared request shape                                                */
/* ------------------------------------------------------------------ */

export const SymbolQuerySchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
});
export type SymbolQuery = z.infer<typeof SymbolQuerySchema>;

const SentimentSnapshotSchema = z.object({
  score: z.number().min(0).max(100),
  label: SentimentLabelSchema,
});

/* ------------------------------------------------------------------ */
/* /analyze — flagship endpoint                                        */
/* ------------------------------------------------------------------ */

export const AnalyzeResponseSchema = z.object({
  symbol: SymbolSchema,
  action: ActionSchema,
  confidence: z.number().min(0).max(100),
  risk: RiskLevelSchema,
  reason: z.array(z.string()).min(1),
  marketSummary: z.string(),
  liquidityScore: z.number().min(0).max(100),
  volatility: z.number().min(0).max(100),
  sentiment: SentimentSnapshotSchema,
  technicalSummary: z.string(),
  recommendation: z.string(),
  meta: ResponseMetaSchema,
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/* ------------------------------------------------------------------ */
/* /market-summary                                                     */
/* ------------------------------------------------------------------ */

export const MarketSummaryResponseSchema = z.object({
  symbol: SymbolSchema,
  priceUsd: z.number().positive(),
  change24hPct: z.number(),
  volume24hUsd: z.number().nonnegative(),
  marketCapUsd: z.number().nonnegative().optional(),
  liquidityScore: z.number().min(0).max(100),
  volatility: z.number().min(0).max(100),
  summary: z.string(),
  meta: ResponseMetaSchema,
});
export type MarketSummaryResponse = z.infer<typeof MarketSummaryResponseSchema>;

/* ------------------------------------------------------------------ */
/* /sentiment                                                          */
/* ------------------------------------------------------------------ */

export const SentimentResponseSchema = z.object({
  scope: z.string(), // symbol, or "MARKET" for market-wide
  fearGreedIndex: z.number().min(0).max(100),
  label: SentimentLabelSchema,
  newsSentiment: z.number().min(-1).max(1).nullable(),
  summary: z.string(),
  meta: ResponseMetaSchema,
});
export type SentimentResponse = z.infer<typeof SentimentResponseSchema>;

/* ------------------------------------------------------------------ */
/* /risk-analysis                                                      */
/* ------------------------------------------------------------------ */

export const RiskAnalysisResponseSchema = z.object({
  symbol: SymbolSchema,
  riskLevel: RiskLevelSchema,
  riskScore: z.number().min(0).max(100),
  volatility: z.number().min(0).max(100),
  liquidityScore: z.number().min(0).max(100),
  drawdownRiskPct: z.number().min(0).max(100),
  factors: z.array(z.string()),
  meta: ResponseMetaSchema,
});
export type RiskAnalysisResponse = z.infer<typeof RiskAnalysisResponseSchema>;

/* ------------------------------------------------------------------ */
/* /technical-summary                                                  */
/* ------------------------------------------------------------------ */

export const TrendDirectionSchema = z.enum(['UPTREND', 'DOWNTREND', 'SIDEWAYS']);

export const TechnicalSummaryResponseSchema = z.object({
  symbol: SymbolSchema,
  trend: TrendDirectionSchema,
  momentum: z.number().min(-100).max(100),
  support: z.number().nonnegative().optional(),
  resistance: z.number().nonnegative().optional(),
  summary: z.string(),
  meta: ResponseMetaSchema,
});
export type TechnicalSummaryResponse = z.infer<typeof TechnicalSummaryResponseSchema>;

/* ------------------------------------------------------------------ */
/* /trending-assets                                                    */
/* ------------------------------------------------------------------ */

export const TrendingAssetSchema = z.object({
  symbol: SymbolSchema,
  rank: z.number().int().positive(),
  priceUsd: z.number().positive(),
  change24hPct: z.number(),
  trendScore: z.number().min(0).max(100),
});

export const TrendingAssetsResponseSchema = z.object({
  assets: z.array(TrendingAssetSchema),
  meta: ResponseMetaSchema,
});
export type TrendingAssetsResponse = z.infer<typeof TrendingAssetsResponseSchema>;

/* ------------------------------------------------------------------ */
/* /portfolio-health                                                   */
/* ------------------------------------------------------------------ */

export const PortfolioHoldingSchema = z.object({
  symbol: SymbolSchema,
  quantity: z.number().positive(),
});

export const PortfolioHealthRequestSchema = z.object({
  holdings: z.array(PortfolioHoldingSchema).min(1).max(50),
});
export type PortfolioHealthRequest = z.infer<typeof PortfolioHealthRequestSchema>;

export const PortfolioHealthResponseSchema = z.object({
  totalValueUsd: z.number().nonnegative(),
  diversificationScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  concentrationWarnings: z.array(z.string()),
  recommendation: z.string(),
  meta: ResponseMetaSchema,
});
export type PortfolioHealthResponse = z.infer<typeof PortfolioHealthResponseSchema>;

/* ------------------------------------------------------------------ */
/* /execution-readiness                                                */
/* ------------------------------------------------------------------ */

export const ReadinessSchema = z.enum(['READY', 'CAUTION', 'NOT_READY']);

export const ExecutionReadinessResponseSchema = z.object({
  symbol: SymbolSchema,
  readiness: ReadinessSchema,
  liquidityScore: z.number().min(0).max(100),
  volatility: z.number().min(0).max(100),
  estimatedSlippagePct: z.number().nonnegative(),
  summary: z.string(),
  meta: ResponseMetaSchema,
});
export type ExecutionReadinessResponse = z.infer<typeof ExecutionReadinessResponseSchema>;
