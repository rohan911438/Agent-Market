import { encodePaymentPayload } from '@agentmarket/payments';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

describe('/v1/analyze — full x402 flow', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer(buildTestContext());
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns 402 with valid PaymentRequirements when no X-PAYMENT header is present', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/analyze?symbol=BTC' });
    expect(res.statusCode).toBe(402);
    const body = res.json();
    expect(body.x402Version).toBeDefined();
    expect(body.accepts[0].resource).toBe('/v1/analyze');
    expect(Number(body.accepts[0].maxAmountRequired)).toBeGreaterThan(0);
  });

  it('completes the full 402 -> pay -> 200 flow and returns a structured, explainable response', async () => {
    const header = encodePaymentPayload({
      x402Version: 1,
      scheme: 'exact',
      network: 'mock',
      payload: { nonce: `analyze-${Date.now()}`, address: 'TESTWALLETADDR1' },
    });

    const res = await server.inject({
      method: 'GET',
      url: '/v1/analyze?symbol=BTC',
      headers: { 'x-payment': header },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.symbol).toBe('BTC');
    expect(['BUY', 'SELL', 'HOLD']).toContain(body.action);
    expect(body.confidence).toBeGreaterThanOrEqual(0);
    expect(body.confidence).toBeLessThanOrEqual(100);
    expect(Array.isArray(body.reason)).toBe(true);
    expect(body.reason.length).toBeGreaterThan(0);
    expect(body.meta.status).toBe('live');
  });

  it('replays the exact same response for a duplicate X-PAYMENT instead of re-settling (idempotency)', async () => {
    const header = encodePaymentPayload({
      x402Version: 1,
      scheme: 'exact',
      network: 'mock',
      payload: { nonce: `replay-${Date.now()}`, address: 'TESTWALLETADDR2' },
    });

    const first = await server.inject({ method: 'GET', url: '/v1/analyze?symbol=ETH', headers: { 'x-payment': header } });
    const second = await server.inject({ method: 'GET', url: '/v1/analyze?symbol=ETH', headers: { 'x-payment': header } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-payment-replay']).toBe('true');
    expect(first.body).toBe(second.body);
  });

  it('rejects a malformed X-PAYMENT header with 400 PAYMENT_INVALID', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/v1/analyze?symbol=BTC',
      headers: { 'x-payment': 'not-a-real-payload' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('PAYMENT_INVALID');
  });

  it('rejects an invalid symbol with 400 VALIDATION_ERROR before ever processing payment', async () => {
    const header = encodePaymentPayload({
      x402Version: 1,
      scheme: 'exact',
      network: 'mock',
      payload: { nonce: `invalid-${Date.now()}` },
    });

    const res = await server.inject({
      method: 'GET',
      url: '/v1/analyze?symbol=!!',
      headers: { 'x-payment': header },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
