import type { ProviderAdapter } from './provider-adapter.js';

export interface PriceData {
  symbol: string;
  priceUsd: number;
  change24hPct: number;
  volume24hUsd: number;
  marketCapUsd?: number;
  source: string;
}

export interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OhlcData {
  symbol: string;
  candles: OhlcCandle[];
  source: string;
}

export interface TrendingAssetData {
  symbol: string;
  rank: number;
  priceUsd?: number;
  change24hPct?: number;
}

export interface FearGreedData {
  value: number;
  label: string;
  source: string;
}

export interface ProtocolTvlData {
  symbol: string;
  tvlUsd: number;
  change24hPct?: number;
  source: string;
}

export interface NewsSentimentData {
  articleCount: number;
  sentiment: number; // -1..1
}

export type PriceProviderAdapter = ProviderAdapter<{ symbol: string }, PriceData>;
export type OhlcProviderAdapter = ProviderAdapter<{ symbol: string; days: number }, OhlcData>;
export type TrendingProviderAdapter = ProviderAdapter<{ limit: number }, TrendingAssetData[]>;
export type FearGreedProviderAdapter = ProviderAdapter<Record<string, never>, FearGreedData>;
export type NewsSentimentProviderAdapter = ProviderAdapter<{ query: string }, NewsSentimentData>;
