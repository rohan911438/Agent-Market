import { SymbolSchema, TimeframeSchema } from '@rohankumar4179/shared-types';
import { z } from 'zod';

const NormalizeInputSchema = z.object({
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.default('24h'),
});

export interface NormalizedInput {
  symbol: string;
  timeframe: '1h' | '24h' | '7d' | '30d';
}

export function normalizeInput(raw: { symbol: string; timeframe?: string }): NormalizedInput {
  return NormalizeInputSchema.parse(raw);
}
