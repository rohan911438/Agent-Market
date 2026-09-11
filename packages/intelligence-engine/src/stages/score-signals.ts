import type { OhlcCandle } from '@agentmarket/providers';
import type { MarketSnapshot, SignalScores, TrendDirection } from '../types.js';
import { clamp } from '../utils.js';

function computeMomentum(candles: OhlcCandle[] | undefined, change24hPct: number | undefined): number {
  if (candles && candles.length >= 2) {
    const first = candles[0]!.close;
    const last = candles[candles.length - 1]!.close;
    if (first > 0) {
      const pctMove = ((last - first) / first) * 100;
      return clamp(Math.round(pctMove * 4), -100, 100);
    }
  }
  if (change24hPct !== undefined) return clamp(Math.round(change24hPct * 5), -100, 100);
  return 0;
}

function computeVolatility(candles: OhlcCandle[] | undefined): number {
  if (!candles || candles.length < 2) return 50; // unknown -> assume medium risk, never zero
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.close;
    const curr = candles[i]!.close;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  if (returns.length === 0) return 50;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const stdev = Math.sqrt(variance);
  // A 5%-per-candle stdev maps to the top of the scale.
  return clamp(Math.round((stdev / 0.05) * 100), 0, 100);
}

function computeLiquidity(volume24hUsd: number | undefined, marketCapUsd: number | undefined): number {
  if (volume24hUsd === undefined) return 50;

  let score: number;
  if (volume24hUsd >= 1_000_000_000) score = 90;
  else if (volume24hUsd >= 100_000_000) score = 75;
  else if (volume24hUsd >= 10_000_000) score = 55;
  else if (volume24hUsd >= 1_000_000) score = 35;
  else score = 15;

  if (marketCapUsd && marketCapUsd > 0) {
    const turnover = volume24hUsd / marketCapUsd;
    const turnoverBonus = clamp(Math.round(turnover * 200), -20, 20);
    score = clamp(score + turnoverBonus, 0, 100);
  }
  return score;
}

function computeSentimentScore(fearGreedIndex: number | undefined, newsSentiment: number | null | undefined): number {
  const fgScore = fearGreedIndex ?? 50;
  if (newsSentiment === null || newsSentiment === undefined) return Math.round(fgScore);
  const newsScore = (newsSentiment + 1) * 50; // -1..1 -> 0..100
  return Math.round(fgScore * 0.7 + newsScore * 0.3);
}

function computeTrendStrength(candles: OhlcCandle[] | undefined): number {
  if (!candles || candles.length < 3) return 50;
  let ups = 0;
  let downs = 0;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.close;
    const curr = candles[i]!.close;
    if (curr > prev) ups += 1;
    else if (curr < prev) downs += 1;
  }
  const total = ups + downs;
  if (total === 0) return 50;
  const dominance = Math.max(ups, downs) / total; // 0.5..1
  return clamp(Math.round(((dominance - 0.5) / 0.5) * 100), 0, 100);
}

function resolveTrendDirection(momentum: number): TrendDirection {
  if (momentum > 5) return 'UPTREND';
  if (momentum < -5) return 'DOWNTREND';
  return 'SIDEWAYS';
}

/** Pure function: same snapshot always yields the same scores — deterministic and unit-testable. */
export function scoreSignals(snapshot: MarketSnapshot): SignalScores {
  const momentum = computeMomentum(snapshot.candles, snapshot.change24hPct);
  const volatility = computeVolatility(snapshot.candles);
  const liquidity = computeLiquidity(snapshot.volume24hUsd, snapshot.marketCapUsd);
  const sentiment = computeSentimentScore(snapshot.fearGreedIndex, snapshot.newsSentiment);
  const trendStrength = computeTrendStrength(snapshot.candles);
  const trendDirection = resolveTrendDirection(momentum);

  return { momentum, volatility, liquidity, sentiment, trendStrength, trendDirection };
}
