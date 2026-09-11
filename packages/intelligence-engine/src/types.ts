import type {
  FearGreedData,
  NewsSentimentData,
  OhlcCandle,
  OhlcData,
  PriceData,
  ProviderResult,
} from '@agentmarket/providers';

export interface RawMarketData {
  symbol: string;
  price?: ProviderResult<PriceData>;
  ohlc?: ProviderResult<OhlcData>;
  fearGreed?: ProviderResult<FearGreedData>;
  newsSentiment?: ProviderResult<NewsSentimentData>;
}

/** Normalized view of everything the scoring stages need, independent of which provider supplied it. */
export interface MarketSnapshot {
  symbol: string;
  priceUsd?: number;
  change24hPct?: number;
  volume24hUsd?: number;
  marketCapUsd?: number;
  candles?: OhlcCandle[];
  fearGreedIndex?: number;
  fearGreedLabel?: string;
  newsSentiment?: number | null;
  /** Distinct provider names that actually contributed data. */
  sourcesUsed: string[];
  /** Fraction (0-1) of the requested data points that were successfully populated. */
  dataCompleteness: number;
}

export type TrendDirection = 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';

export interface SignalScores {
  /** -100..100, direction and strength of recent price movement. */
  momentum: number;
  /** 0..100, higher = more volatile. */
  volatility: number;
  /** 0..100, higher = deeper/more liquid. */
  liquidity: number;
  /** 0..100, higher = greedier market sentiment. */
  sentiment: number;
  /** 0..100, how consistently price has moved in trendDirection. */
  trendStrength: number;
  trendDirection: TrendDirection;
}
