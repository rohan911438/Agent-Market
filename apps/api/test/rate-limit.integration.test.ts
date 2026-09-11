import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

describe('rate limiting', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer(buildTestContext({ rateLimits: { anonymousPerMinute: 2, walletVerifiedPerMinute: 2, dailySpendCapUsd: 1000 } }));
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns 429 RATE_LIMITED after exceeding the anonymous per-IP limit', async () => {
    const first = await server.inject({ method: 'GET', url: '/v1/analyze?symbol=BTC' });
    const second = await server.inject({ method: 'GET', url: '/v1/analyze?symbol=BTC' });
    const third = await server.inject({ method: 'GET', url: '/v1/analyze?symbol=BTC' });

    // First two consume the bucket (both return 402 since no payment attached — rate limit runs first).
    expect(first.statusCode).toBe(402);
    expect(second.statusCode).toBe(402);
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('RATE_LIMITED');
    expect(third.headers['retry-after']).toBeDefined();
  });
});

describe('free routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer(buildTestContext());
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health returns ok with no payment required', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /v1/marketplace lists APIs with no payment required', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/marketplace' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().apis)).toBe(true);
  });

  it('GET /v1/dashboard returns 404 NOT_FOUND for an unknown wallet', async () => {
    const res = await server.inject({ method: 'GET', url: '/v1/dashboard?wallet=UNKNOWNWALLET' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
