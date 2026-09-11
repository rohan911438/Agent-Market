import type { ProtocolTvlData } from '../types.js';
import type { ProviderAdapter } from '../provider-adapter.js';

interface DefiLlamaProtocol {
  symbol?: string;
  name: string;
  tvl: number;
  change_1d?: number;
}

/** Supplementary liquidity-context signal (top protocols by TVL). Not required for core pricing. */
export class DefiLlamaTvlAdapter implements ProviderAdapter<{ limit: number }, ProtocolTvlData[]> {
  readonly name = 'defillama';

  isAvailable(): boolean {
    return true;
  }

  async execute({ limit }: { limit: number }): Promise<ProtocolTvlData[]> {
    const res = await fetch('https://api.llama.fi/protocols');
    if (!res.ok) throw new Error(`defillama: HTTP ${res.status}`);
    const data = (await res.json()) as DefiLlamaProtocol[];

    return data
      .filter((protocol) => typeof protocol.tvl === 'number' && protocol.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, limit)
      .map((protocol) => ({
        symbol: (protocol.symbol || protocol.name).toUpperCase(),
        tvlUsd: protocol.tvl,
        change24hPct: protocol.change_1d,
        source: this.name,
      }));
  }
}
