export const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ALGO: 'algorand',
  USDC: 'usd-coin',
  USDT: 'tether',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  MATIC: 'matic-network',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  LTC: 'litecoin',
  TON: 'the-open-network',
};

export function toCoingeckoId(symbol: string): string | undefined {
  return COINGECKO_ID_MAP[symbol.toUpperCase()];
}

/** Assets with no liquid USDT spot pair on Binance. */
const BINANCE_UNSUPPORTED = new Set(['USDT', 'ALGO']);

export function toBinancePair(symbol: string): string | undefined {
  const upper = symbol.toUpperCase();
  if (BINANCE_UNSUPPORTED.has(upper)) return undefined;
  return `${upper}USDT`;
}
