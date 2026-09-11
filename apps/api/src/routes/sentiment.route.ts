import { buildCacheKey, ttlFor } from '@agentmarket/cache';
import { sentimentLabel } from '@agentmarket/intelligence-engine';
import { SentimentResponseSchema, SymbolSchema, type SentimentResponse } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { registerMeteredRoute } from './register-metered-route.js';

const QuerySchema = z.object({
  symbol: SymbolSchema.optional(),
});

export function registerSentimentRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'GET',
    url: '/v1/sentiment',
    resource: '/v1/sentiment',
    priceUsd: 0.02,
    querySchema: QuerySchema,
    handler: async ({ query, request }) => {
      const scope = query.symbol ?? 'MARKET';
      const cacheKey = buildCacheKey('sentiment', { scope });

      const { value, cacheHit } = await ctx.cache.getOrSet(cacheKey, ttlFor('sentiment'), async () => {
        const start = Date.now();
        const { snapshot, signals } = await ctx.intelligenceEngine.computeSnapshotAndSignals(
          query.symbol ?? 'BTC',
          '24h',
        );

        const body: SentimentResponse = {
          scope,
          fearGreedIndex: snapshot.fearGreedIndex ?? signals.sentiment,
          label: sentimentLabel(signals.sentiment),
          newsSentiment: snapshot.newsSentiment ?? null,
          summary: `Market sentiment is ${sentimentLabel(signals.sentiment).replace('_', ' ').toLowerCase()} (Fear & Greed ${snapshot.fearGreedIndex ?? '—'}/100).`,
          meta: {
            requestId: request.requestId,
            timestamp: new Date().toISOString(),
            status: 'live',
            cacheHit: false,
            providers: snapshot.sourcesUsed,
            latencyMs: Date.now() - start,
          },
        };
        return body;
      });

      const body = { ...value, meta: { ...value.meta, cacheHit } };
      SentimentResponseSchema.parse(body);
      return { body, cacheHit, providers: value.meta.providers };
    },
  });
}
