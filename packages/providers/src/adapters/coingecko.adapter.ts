import type {
  OhlcCandle,
  OhlcData,
  OhlcProviderAdapter,
  PriceData,
  PriceProviderAdapter,
  TrendingAssetData,
  TrendingProviderAdapter,
} from '../types.js';
import { toCoingeckoId } from '../symbol-map.js';

const BASE_URL = 'https://api.coingecko.com/api/v3';

interface CoinGeckoMarketEntry {
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number;
  market_cap: number;
}

export class CoinGeckoPriceAdapter implements PriceProviderAdapter {
  readonly name = 'coingecko';

  isAvailable(): boolean {
    return true;
  }

  async execute({ symbol }: { symbol: string }): Promise<PriceData> {
    const id = toCoingeckoId(symbol);
    if (!id) throw new Error(`coingecko: unsupported symbol ${symbol}`);

    const res = await fetch(`${BASE_URL}/coins/markets?vs_currency=usd&ids=${id}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
    const data = (await res.json()) as CoinGeckoMarketEntry[];
    const coin = data[0];
    if (!coin) throw new Error(`coingecko: no market data for ${symbol}`);

    return {
      symbol: symbol.toUpperCase(),
      priceUsd: coin.current_price,
      change24hPct: coin.price_change_percentage_24h ?? 0,
      volume24hUsd: coin.total_volume,
      marketCapUsd: coin.market_cap,
      source: this.name,
    };
  }
}

export class CoinGeckoOhlcAdapter implements OhlcProviderAdapter {
  readonly name = 'coingecko';

  isAvailable(): boolean {
    return true;
  }

  async execute({ symbol, days }: { symbol: string; days: number }): Promise<OhlcData> {
    const id = toCoingeckoId(symbol);
    if (!id) throw new Error(`coingecko: unsupported symbol ${symbol}`);

    const res = await fetch(`${BASE_URL}/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
    if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
    const raw = (await res.json()) as [number, number, number, number, number][];

    const candles: OhlcCandle[] = raw.map(([timestamp, open, high, low, close]) => ({
      timestamp,
      open,
      high,
      low,
      close,
    }));

    return { symbol: symbol.toUpperCase(), candles, source: this.name };
  }
}

interface CoinGeckoTrendingCoin {
  item: {
    symbol: string;
    data?: { price?: number; price_change_percentage_24h?: { usd?: number } };
  };
}

export class CoinGeckoTrendingAdapter implements TrendingProviderAdapter {
  readonly name = 'coingecko';

  isAvailable(): boolean {
    return true;
  }

  async execute({ limit }: { limit: number }): Promise<TrendingAssetData[]> {
    const res = await fetch(`${BASE_URL}/search/trending`);
    if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
    const data = (await res.json()) as { coins: CoinGeckoTrendingCoin[] };

    return data.coins.slice(0, limit).map((coin, index) => ({
      symbol: coin.item.symbol.toUpperCase(),
      rank: index + 1,
      priceUsd: coin.item.data?.price,
      change24hPct: coin.item.data?.price_change_percentage_24h?.usd,
    }));
  }
}
