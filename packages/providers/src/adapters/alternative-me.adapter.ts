import type { FearGreedData, FearGreedProviderAdapter } from '../types.js';

interface AlternativeMeResponse {
  data: Array<{ value: string; value_classification: string }>;
}

export class AlternativeMeFearGreedAdapter implements FearGreedProviderAdapter {
  readonly name = 'alternative-me';

  isAvailable(): boolean {
    return true;
  }

  async execute(): Promise<FearGreedData> {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) throw new Error(`alternative-me: HTTP ${res.status}`);
    const data = (await res.json()) as AlternativeMeResponse;
    const entry = data.data[0];
    if (!entry) throw new Error('alternative-me: no data returned');

    return { value: Number(entry.value), label: entry.value_classification, source: this.name };
  }
}
