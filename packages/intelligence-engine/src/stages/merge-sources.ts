import type { MarketSnapshot, RawMarketData } from '../types.js';

// price, ohlc candles, fearGreed — the three core (keyless) inputs every request tries for.
// newsSentiment is a bonus signal (keyed, optional provider) and never penalizes completeness.
const TOTAL_TRACKED_FIELDS = 3;

export function mergeSources(raw: RawMarketData): MarketSnapshot {
  const sourcesUsed = new Set<string>();
  let populatedFields = 0;

  if (raw.price) {
    sourcesUsed.add(raw.price.source);
    populatedFields += 1;
  }
  if (raw.ohlc?.result.candles.length) {
    sourcesUsed.add(raw.ohlc.source);
    populatedFields += 1;
  }
  if (raw.fearGreed) {
    sourcesUsed.add(raw.fearGreed.source);
    populatedFields += 1;
  }
  if (raw.newsSentiment) {
    sourcesUsed.add(raw.newsSentiment.source);
  }

  return {
    symbol: raw.symbol.toUpperCase(),
    priceUsd: raw.price?.result.priceUsd,
    change24hPct: raw.price?.result.change24hPct,
    volume24hUsd: raw.price?.result.volume24hUsd,
    marketCapUsd: raw.price?.result.marketCapUsd,
    candles: raw.ohlc?.result.candles,
    fearGreedIndex: raw.fearGreed?.result.value,
    fearGreedLabel: raw.fearGreed?.result.label,
    newsSentiment: raw.newsSentiment?.result.sentiment ?? null,
    sourcesUsed: Array.from(sourcesUsed),
    dataCompleteness: populatedFields / TOTAL_TRACKED_FIELDS,
  };
}
