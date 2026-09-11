import { encodePaymentPayload } from '@agentmarket/payments';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

function payHeader(nonce: string): string {
  return encodePaymentPayload({
    x402Version: 1,
    scheme: 'exact',
    network: 'mock',
    payload: { nonce, address: `WALLET-${nonce}` },
  });
}

describe('POST /v1/workflows/execute (Phase 12 — Orchestration Engine)', () => {
  let server: FastifyInstance;
  const ctx = buildTestContext();

  beforeAll(async () => {
    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  const threeStepPipeline = [
    { resource: '/v1/sentiment', params: { symbol: 'BTC' } },
    { resource: '/v1/risk-analysis', params: { symbol: '{{steps[0].output.scope}}' } },
    { resource: '/v1/analyze', params: { symbol: '{{steps[1].output.symbol}}' } },
  ];

  it('quotes an upfront price equal to the real sum of every step\'s current price — not a hardcoded assumption', async () => {
    const res = await server.inject({ method: 'POST', url: '/v1/workflows/execute', payload: { steps: threeStepPipeline } });
    expect(res.statusCode).toBe(402);
    const body = res.json();
    // sentiment ($0.02) + risk-analysis ($0.03) + analyze ($0.05) = $0.10, read live from each route's own 402 probe.
    expect(Number(body.accepts[0].maxAmountRequired)).toBe(100_000);
  });

  it('rejects an invalid pipeline (a step referencing a later step) before any payment is taken', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/workflows/execute',
      // No X-PAYMENT header at all — if this got past validation it would 402, not 400.
      payload: { steps: [{ resource: '/v1/sentiment', params: { symbol: '{{steps[1].output.x}}' } }, { resource: '/v1/analyze', params: { symbol: 'BTC' } }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a pipeline referencing an unknown resource', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/workflows/execute',
      payload: { steps: [{ resource: '/v1/not-a-real-endpoint', params: {} }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('executes a 3-step pipeline end to end, threading a symbol through each step, with the correct upfront escrow', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/workflows/execute',
      headers: { 'x-payment': payHeader(`workflow-success-${Date.now()}`) },
      payload: { steps: threeStepPipeline },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.steps).toHaveLength(3);
    expect(body.steps.map((s: { status: string }) => s.status)).toEqual(['completed', 'completed', 'completed']);
    expect(body.failedStepIndex).toBeNull();
    expect(body.refundedUsd).toBe(0);
    expect(body.totalChargedUsd).toBeCloseTo(0.02 + 0.03 + 0.05, 10);

    // Threading proof: step 0's `scope` fed step 1's `symbol`, which fed step 2's `symbol`.
    expect(body.steps[0].output.scope).toBe('BTC');
    expect(body.steps[1].output.symbol).toBe('BTC');
    expect(body.steps[2].output.symbol).toBe('BTC');
  });

  it('on a mid-pipeline failure, charges exactly the completed steps and refunds exactly the rest — not just "some refund"', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/workflows/execute',
      headers: { 'x-payment': payHeader(`workflow-partial-failure-${Date.now()}`) },
      payload: {
        steps: [
          { resource: '/v1/sentiment', params: { symbol: 'BTC' } },
          // Deliberately references a field that doesn't exist on step 0's output —
          // resolves to undefined, which fails risk-analysis's required `symbol` schema at execution time.
          { resource: '/v1/risk-analysis', params: { symbol: '{{steps[0].output.thisFieldDoesNotExist}}' } },
          { resource: '/v1/analyze', params: { symbol: 'BTC' } },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.failedStepIndex).toBe(1);
    expect(body.steps.map((s: { status: string }) => s.status)).toEqual(['completed', 'failed', 'skipped']);

    // Step 0 (sentiment, $0.02) completed and was charged; steps 1 and 2
    // ($0.03 + $0.05 = $0.08) never produced a chargeable result.
    expect(body.totalChargedUsd).toBeCloseTo(0.02, 10);
    expect(body.refundedUsd).toBeCloseTo(0.03 + 0.05, 10);
    expect(body.steps[1].error).toBeTruthy();
  });

  describe('the internal settlement path cannot be reached by a normal external request', () => {
    it('leaves every individual step endpoint independently gated — still 402 with no payment, workflow engine or not', async () => {
      const res = await server.inject({ method: 'GET', url: '/v1/sentiment?symbol=BTC' });
      expect(res.statusCode).toBe(402);
    });

    it('records internal per-step settlements under a distinct scheme, never confusable with a real payment', async () => {
      const nonce = `workflow-escrow-marker-${Date.now()}`;
      const res = await server.inject({
        method: 'POST',
        url: '/v1/workflows/execute',
        headers: { 'x-payment': payHeader(nonce) },
        payload: { steps: [{ resource: '/v1/sentiment', params: { symbol: 'BTC' } }] },
      });
      expect(res.statusCode).toBe(200);

      // Scoped to this test's own paymentRef — other tests in this file create
      // their own escrow rows too (including REFUNDED ones), which would
      // otherwise leak into this assertion via the shared test database.
      const escrowRows = await ctx.db.prisma.payment.findMany({
        where: { scheme: 'workflow-escrow', paymentRef: { startsWith: `${nonce}#step` } },
      });
      expect(escrowRows.length).toBeGreaterThan(0);
      expect(escrowRows.every((r) => r.network === 'internal' && r.status === 'SETTLED')).toBe(true);

      // The real, top-level payment for the workflow itself settled through
      // the actual configured (mock) provider — a completely different
      // scheme/network. Exact match (not "contains") — the per-step escrow
      // rows are paymentRef `${nonce}#step0` etc. and would also match a substring search.
      const realRow = await ctx.db.prisma.payment.findUnique({ where: { paymentRef: nonce } });
      expect(realRow?.scheme).toBe('exact');
      expect(realRow?.network).toBe('mock');
    });

    it('cannot itself be called with no payment — the workflow endpoint is gated exactly like any other metered route', async () => {
      const res = await server.inject({ method: 'POST', url: '/v1/workflows/execute', payload: { steps: [{ resource: '/v1/sentiment', params: { symbol: 'BTC' } }] } });
      expect(res.statusCode).toBe(402);
    });
  });
});
