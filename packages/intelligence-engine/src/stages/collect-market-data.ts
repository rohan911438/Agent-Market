import type { ApiProviderRegistry } from '@agentmarket/providers';
import type { RawMarketData } from '../types.js';

const TIMEFRAME_TO_DAYS: Record<string, number> = { '1h': 1, '24h': 1, '7d': 7, '30d': 30 };

/**
 * Pulls every data point the pipeline can use in parallel. Each fetch
 * already carries its own provider fallback chain (packages/providers), so
 * a single upstream outage never fails the whole request — a missing field
 * here just lowers `dataCompleteness` downstream in mergeSources.
 */
export async function collectMarketData(
  registry: ApiProviderRegistry,
  symbol: string,
  timeframe: string,
  newsQuery?: string,
): Promise<RawMarketData> {
  const days = TIMEFRAME_TO_DAYS[timeframe] ?? 1;

  const [price, ohlc, fearGreed, newsSentiment] = await Promise.all([
    registry.fetchPrice(symbol),
    registry.fetchOhlc(symbol, days),
    registry.fetchFearGreed(),
    newsQuery ? registry.fetchNewsSentiment(newsQuery) : Promise.resolve(undefined),
  ]);

  return { symbol, price, ohlc, fearGreed, newsSentiment };
}
