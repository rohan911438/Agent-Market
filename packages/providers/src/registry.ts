import type { ProviderAdapter } from './provider-adapter.js';
import type {
  FearGreedData,
  FearGreedProviderAdapter,
  NewsSentimentData,
  NewsSentimentProviderAdapter,
  OhlcData,
  OhlcProviderAdapter,
  PriceData,
  PriceProviderAdapter,
  TrendingAssetData,
  TrendingProviderAdapter,
} from './types.js';
import { withTimeout } from './with-timeout.js';

export interface ProviderResult<T> {
  result: T;
  source: string;
}

interface CircuitState {
  failureCount: number;
  openUntil?: number;
}

export interface ProviderRegistryConfig {
  priceProviders: PriceProviderAdapter[];
  ohlcProviders?: OhlcProviderAdapter[];
  trendingProviders?: TrendingProviderAdapter[];
  fearGreedProviders?: FearGreedProviderAdapter[];
  newsSentimentProviders?: NewsSentimentProviderAdapter[];
  /** Failures before a provider is temporarily skipped ("opened"). Default 3. */
  failureThreshold?: number;
  /** How long a provider stays skipped after tripping. Default 60s. */
  cooldownMs?: number;
  /** Per-provider call timeout. Default 5s. */
  timeoutMs?: number;
}

/**
 * Fallback chain + circuit breaker over a capability's ordered provider
 * list. A provider that times out or throws is marked failed; after
 * `failureThreshold` consecutive failures it is skipped ("circuit open")
 * for `cooldownMs` so a degraded upstream doesn't add latency to every
 * request. The chain always tries the next provider before giving up —
 * callers see `undefined` only when every provider in the chain failed.
 */
export class ApiProviderRegistry {
  private readonly priceProviders: PriceProviderAdapter[];
  private readonly ohlcProviders: OhlcProviderAdapter[];
  private readonly trendingProviders: TrendingProviderAdapter[];
  private readonly fearGreedProviders: FearGreedProviderAdapter[];
  private readonly newsSentimentProviders: NewsSentimentProviderAdapter[];
  private readonly circuitState = new Map<string, CircuitState>();
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly timeoutMs: number;

  constructor(config: ProviderRegistryConfig) {
    this.priceProviders = config.priceProviders;
    this.ohlcProviders = config.ohlcProviders ?? [];
    this.trendingProviders = config.trendingProviders ?? [];
    this.fearGreedProviders = config.fearGreedProviders ?? [];
    this.newsSentimentProviders = config.newsSentimentProviders ?? [];
    this.failureThreshold = config.failureThreshold ?? 3;
    this.cooldownMs = config.cooldownMs ?? 60_000;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  private isOpen(name: string): boolean {
    const state = this.circuitState.get(name);
    if (!state?.openUntil) return false;
    if (state.openUntil < Date.now()) {
      this.circuitState.delete(name);
      return false;
    }
    return true;
  }

  private recordFailure(name: string): void {
    const state = this.circuitState.get(name) ?? { failureCount: 0 };
    state.failureCount += 1;
    if (state.failureCount >= this.failureThreshold) {
      state.openUntil = Date.now() + this.cooldownMs;
    }
    this.circuitState.set(name, state);
  }

  private recordSuccess(name: string): void {
    this.circuitState.delete(name);
  }

  isCircuitOpen(name: string): boolean {
    return this.isOpen(name);
  }

  private async runChain<TArgs, TResult>(
    providers: ProviderAdapter<TArgs, TResult>[],
    args: TArgs,
  ): Promise<ProviderResult<TResult> | undefined> {
    for (const provider of providers) {
      if (!provider.isAvailable() || this.isOpen(provider.name)) continue;
      try {
        const result = await withTimeout(provider.execute(args), this.timeoutMs, provider.name);
        this.recordSuccess(provider.name);
        return { result, source: provider.name };
      } catch {
        this.recordFailure(provider.name);
      }
    }
    return undefined;
  }

  fetchPrice(symbol: string): Promise<ProviderResult<PriceData> | undefined> {
    return this.runChain(this.priceProviders, { symbol });
  }

  fetchOhlc(symbol: string, days: number): Promise<ProviderResult<OhlcData> | undefined> {
    return this.runChain(this.ohlcProviders, { symbol, days });
  }

  fetchTrending(limit: number): Promise<ProviderResult<TrendingAssetData[]> | undefined> {
    return this.runChain(this.trendingProviders, { limit });
  }

  fetchFearGreed(): Promise<ProviderResult<FearGreedData> | undefined> {
    return this.runChain(this.fearGreedProviders, {});
  }

  fetchNewsSentiment(query: string): Promise<ProviderResult<NewsSentimentData> | undefined> {
    return this.runChain(this.newsSentimentProviders, { query });
  }
}
