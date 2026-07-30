import { AlternativeMeFearGreedAdapter } from './adapters/alternative-me.adapter.js';
import { BinanceOhlcAdapter, BinancePriceAdapter } from './adapters/binance.adapter.js';
import { CoinGeckoOhlcAdapter, CoinGeckoPriceAdapter, CoinGeckoTrendingAdapter } from './adapters/coingecko.adapter.js';
import { NewsApiSentimentAdapter } from './adapters/newsapi.adapter.js';
import { ApiProviderRegistry } from './registry.js';

export interface CreateProviderRegistryOptions {
  newsApiKey?: string;
}

/**
 * Wires the default Phase 1 provider chain: CoinGecko first (richest data),
 * Binance as fallback for price/OHLC. All four core providers are keyless;
 * NewsAPI is registered but only ever selected when a key is configured.
 */
export function createProviderRegistry(options: CreateProviderRegistryOptions = {}): ApiProviderRegistry {
  return new ApiProviderRegistry({
    priceProviders: [new CoinGeckoPriceAdapter(), new BinancePriceAdapter()],
    ohlcProviders: [new CoinGeckoOhlcAdapter(), new BinanceOhlcAdapter()],
    trendingProviders: [new CoinGeckoTrendingAdapter()],
    fearGreedProviders: [new AlternativeMeFearGreedAdapter()],
    newsSentimentProviders: [new NewsApiSentimentAdapter(options.newsApiKey)],
  });
}
