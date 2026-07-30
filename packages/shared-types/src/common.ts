import { z } from 'zod';

export const ActionSchema = z.enum(['BUY', 'SELL', 'HOLD']);
export type Action = z.infer<typeof ActionSchema>;

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/** "live" = real providers + full pipeline. "beta" = structurally real endpoint, simplified data. */
export const EndpointStatusSchema = z.enum(['live', 'beta']);
export type EndpointStatus = z.infer<typeof EndpointStatusSchema>;

export const SentimentLabelSchema = z.enum([
  'EXTREME_FEAR',
  'FEAR',
  'NEUTRAL',
  'GREED',
  'EXTREME_GREED',
]);
export type SentimentLabel = z.infer<typeof SentimentLabelSchema>;

export const SymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,10}$/, 'symbol must be 2-10 alphanumeric characters');
export type AssetSymbol = z.infer<typeof SymbolSchema>;

export const TimeframeSchema = z.enum(['1h', '24h', '7d', '30d']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const ResponseMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string().datetime(),
  status: EndpointStatusSchema,
  cacheHit: z.boolean(),
  providers: z.array(z.string()),
  latencyMs: z.number().nonnegative(),
});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;
