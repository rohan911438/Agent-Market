import { encodePaymentPayload } from '@agentmarket/payments';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

/**
 * Regression coverage for a real race condition: the daily per-wallet spend
 * cap used to be enforced by SELECT-summing settled payments, then comparing
 * in application code, then writing — three separate round trips. Multiple
 * concurrent requests for the same wallet could each read the same
 * not-yet-updated sum, each see themselves as "under the cap," and all
 * proceed, together spending well past it. The fix (WalletRepository.reserveDailySpend)
 * replaces that with one atomic conditional UPDATE. This test fires several
 * concurrent payments for one wallet against a cap that allows only some of
 * them through, and asserts the cap is never exceeded regardless of timing.
 */
describe('daily spend cap — concurrent requests', () => {
  let server: FastifyInstance;
  const PRICE_USD = 0.05;
  const CAP_USD = 0.12; // room for exactly 2 of 5 concurrent $0.05 payments

  beforeAll(async () => {
    server = buildServer(
      buildTestContext({
        rateLimits: { anonymousPerMinute: 1000, walletVerifiedPerMinute: 1000, dailySpendCapUsd: CAP_USD },
      }),
    );
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('never lets concurrent payments for one wallet jointly exceed the daily cap', async () => {
    const address = 'CONCURRENTSPENDCAPWALLET';
    const requests = Array.from({ length: 5 }, (_, i) =>
      server.inject({
        method: 'GET',
        url: '/v1/analyze?symbol=BTC',
        headers: {
          'x-payment': encodePaymentPayload({
            x402Version: 1,
            scheme: 'exact',
            network: 'mock',
            payload: { nonce: `spend-cap-race-${i}-${Date.now()}`, address },
          }),
        },
      }),
    );

    const results = await Promise.all(requests);
    const succeeded = results.filter((r) => r.statusCode === 200);
    const budgetExceeded = results.filter((r) => r.statusCode === 402 && r.json().error?.code === 'BUDGET_EXCEEDED');

    // At most floor(cap/price) = 2 can succeed — never more, no matter how the
    // concurrent requests interleaved.
    expect(succeeded.length).toBeLessThanOrEqual(Math.floor(CAP_USD / PRICE_USD));
    expect(succeeded.length + budgetExceeded.length).toBe(results.length);
    expect(succeeded.length).toBeGreaterThan(0);
  });
});
