import { encodePaymentPayload } from '@agentmarket/payments';
import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

/**
 * Acceptance criterion: "A request through any first-party metered route
 * produces a trace... with distinguishable spans for at least the payment
 * gate and the handler." Registers its own provider with an in-memory
 * exporter (never a real backend — see tracing.ts) so the resulting spans
 * can be asserted on directly, without depending on console output.
 */
describe('OpenTelemetry tracing (Phase 13)', () => {
  let server: FastifyInstance;
  const exporter = new InMemorySpanExporter();
  const ctx = buildTestContext();

  beforeAll(async () => {
    // buildTestContext() above already registered a real (but silent, no
    // processors) provider — see initTracingForTests(). Disable it first so
    // this test's own InMemorySpanExporter-backed provider wins the global
    // registration slot instead of being silently rejected as a duplicate.
    trace.disable();
    const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    provider.register();

    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('produces one trace per request through a metered route, with distinguishable payment-gate and handler spans', async () => {
    exporter.reset();

    const header = encodePaymentPayload({
      x402Version: 1,
      scheme: 'exact',
      network: 'mock',
      payload: { nonce: `tracing-${Date.now()}`, address: 'TRACING_WALLET' },
    });

    const res = await server.inject({ method: 'GET', url: '/v1/sentiment?symbol=BTC', headers: { 'x-payment': header } });
    expect(res.statusCode).toBe(200);

    const spans: ReadableSpan[] = exporter.getFinishedSpans();
    const names = spans.map((s) => s.name);

    expect(names).toContain('payment.gate');
    expect(names).toContain('handler');
    expect(names).toContain('rate_limit.check');
    expect(names.some((n) => n.includes('/v1/sentiment'))).toBe(true); // the root span

    // Every span for this request shares one trace id — the whole
    // lifecycle is one trace, not several disconnected ones.
    const traceIds = new Set(spans.map((s) => s.spanContext().traceId));
    expect(traceIds.size).toBe(1);

    const paymentGateSpan = spans.find((s) => s.name === 'payment.gate')!;
    const handlerSpan = spans.find((s) => s.name === 'handler')!;
    const rootSpan = spans.find((s) => s.name.includes('/v1/sentiment'))!;

    // Child spans are parented to the root span, not to each other or floating free.
    expect(paymentGateSpan.parentSpanContext?.spanId).toBe(rootSpan.spanContext().spanId);
    expect(handlerSpan.parentSpanContext?.spanId).toBe(rootSpan.spanContext().spanId);

    // requestId (the response's tracing correlation id, and what
    // ApiRequest.requestId records) *is* the trace id — not a second,
    // disconnected identifier.
    const apiRequestRow = await ctx.db.prisma.apiRequest.findFirst({
      where: { route: '/v1/sentiment' },
      orderBy: { createdAt: 'desc' },
    });
    expect(apiRequestRow?.requestId).toBe(rootSpan.spanContext().traceId);
  });
});
