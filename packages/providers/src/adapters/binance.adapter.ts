import type { OhlcCandle, OhlcData, OhlcProviderAdapter, PriceData, PriceProviderAdapter } from '../types.js';
import { toBinancePair } from '../symbol-map.js';

const BASE_URL = 'https://api.binance.com/api/v3';

interface BinanceTicker24hr {
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

export class BinancePriceAdapter implements PriceProviderAdapter {
  readonly name = 'binance';

  isAvailable(): boolean {
    return true;
  }

  async execute({ symbol }: { symbol: string }): Promise<PriceData> {
    const pair = toBinancePair(symbol);
    if (!pair) throw new Error(`binance: unsupported symbol ${symbol}`);

    const res = await fetch(`${BASE_URL}/ticker/24hr?symbol=${pair}`);
    if (!res.ok) throw new Error(`binance: HTTP ${res.status}`);
    const data = (await res.json()) as BinanceTicker24hr;

    return {
      symbol: symbol.toUpperCase(),
      priceUsd: Number(data.lastPrice),
      change24hPct: Number(data.priceChangePercent),
      volume24hUsd: Number(data.quoteVolume),
      source: this.name,
    };
  }
}

type BinanceKline = [number, string, string, string, string, ...unknown[]];

export class BinanceOhlcAdapter implements OhlcProviderAdapter {
  readonly name = 'binance';

  isAvailable(): boolean {
    return true;
  }

  async execute({ symbol, days }: { symbol: string; days: number }): Promise<OhlcData> {
    const pair = toBinancePair(symbol);
    if (!pair) throw new Error(`binance: unsupported symbol ${symbol}`);

    const interval = days <= 1 ? '1h' : '1d';
    const limit = days <= 1 ? 24 : Math.min(days, 1000);
    const res = await fetch(`${BASE_URL}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
    if (!res.ok) throw new Error(`binance: HTTP ${res.status}`);
    const raw = (await res.json()) as BinanceKline[];

    const candles: OhlcCandle[] = raw.map(([timestamp, open, high, low, close]) => ({
      timestamp,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
    }));

    return { symbol: symbol.toUpperCase(), candles, source: this.name };
  }
}
