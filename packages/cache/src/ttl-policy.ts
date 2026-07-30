/** Freshness policy per data type — how stale each kind of cached value is allowed to get. */
export const CACHE_TTL_SECONDS = {
  price: 30,
  marketSummary: 60,
  ohlc: 300,
  trending: 300,
  sentiment: 900,
  fearGreed: 900,
  analyze: 60,
  riskAnalysis: 60,
  technicalSummary: 300,
  portfolioHealth: 60,
  executionReadiness: 60,
} as const;

export type CacheableDataType = keyof typeof CACHE_TTL_SECONDS;

export function ttlFor(dataType: CacheableDataType): number {
  return CACHE_TTL_SECONDS[dataType];
}
