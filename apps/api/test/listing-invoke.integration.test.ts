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

const RISK_SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Wallet Risk API', version: '1.0.0' },
  paths: {
    '/wallet-risk': {
      get: {
        operationId: 'getWalletRisk',
        parameters: [{ name: 'address', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
});

describe('POST /v1/listings/:slug/invoke — third-party gateway', () => {
  let server: FastifyInstance;
  const ctx = buildTestContext();

  beforeAll(async () => {
    server = buildServer(ctx);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // Verification is one-time-per-wallet-address, globally, forever (see
  // findVerifiedByWalletAddress in provider-account.route.ts — a wallet
  // can't back more than one verified provider identity, by design) — and
  // every integration test file shares one real Postgres database for the
  // whole `vitest run` (fileParallelism: false, no reset between files), so
  // this file's wallets must not collide with any other file's. W/X/Y/Z are
  // unused by every other apps/api/test/*.ts file as of this writing.
  let walletSuffix = 0;
  function nextWallet(): string {
    walletSuffix += 1;
    return String.fromCharCode('W'.charCodeAt(0) + walletSuffix - 1).repeat(58);
  }

  async function publishListing(opts: { slug: string; upstreamUrl: string; email: string }) {
    const wallet = nextWallet();
    const register = await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'Invoke Test Provider', email: opts.email, walletAddress: wallet },
    });
    const apiKey = register.json().apiKey as string;

    const create = await server.inject({
      method: 'POST',
      url: '/v1/listings',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        slug: opts.slug,
        name: 'Wallet Risk',
        description: 'Flags risky wallets.',
        category: 'Risk',
        upstreamUrl: opts.upstreamUrl,
        openApiSpec: RISK_SPEC,
      },
    });
    const listingId = create.json().id;

    await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });
    await server.inject({
      method: 'PATCH',
      url: `/v1/listings/${listingId}/pricing`,
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { pricingModel: 'pay_per_call', priceUsd: 0.02 },
    });
    await server.inject({
      method: 'PATCH',
      url: `/v1/listings/${listingId}/payment`,
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { payoutWalletAddress: wallet },
    });
    await server.inject({ method: 'POST', url: `/v1/listings/${listingId}/publish`, headers: { authorization: `Bearer ${apiKey}` } });
    return listingId as string;
  }

  it('402s with the listing\'s own price when called with no payment', async () => {
    await publishListing({ slug: 'invoke-402-test', upstreamUrl: 'https://api.ledgerwatch.test/v1', email: 'invoke-402@test.dev' });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/listings/invoke-402-test/invoke',
      payload: { operationId: 'getWalletRisk', params: { address: 'ABC' } },
    });
    expect(res.statusCode).toBe(402);
    expect(Number(res.json().accepts[0].maxAmountRequired)).toBe(20_000); // $0.02
  });

  it('rejects an unknown operationId before taking payment', async () => {
    await publishListing({ slug: 'invoke-badop-test', upstreamUrl: 'https://api.ledgerwatch.test/v1', email: 'invoke-badop@test.dev' });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/listings/invoke-badop-test/invoke',
      headers: { 'x-payment': payHeader('invoke-badop') },
      payload: { operationId: 'notARealOperation', params: {} },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('rejects a listing whose upstream is a blocked internal address before taking payment', async () => {
    await publishListing({ slug: 'invoke-ssrf-test', upstreamUrl: 'http://169.254.169.254/latest', email: 'invoke-ssrf@test.dev' });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/listings/invoke-ssrf-test/invoke',
      headers: { 'x-payment': payHeader('invoke-ssrf') },
      payload: { operationId: 'getWalletRisk', params: { address: 'ABC' } },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('takes payment, then reports PROVIDER_UNAVAILABLE for an unreachable upstream — the payment gate itself still ran for real', async () => {
    await publishListing({ slug: 'invoke-unreachable-test', upstreamUrl: 'https://listing-upstream.invalid/v1', email: 'invoke-unreachable@test.dev' });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/listings/invoke-unreachable-test/invoke',
      headers: { 'x-payment': payHeader('invoke-unreachable') },
      payload: { operationId: 'getWalletRisk', params: { address: 'ABC' } },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('PROVIDER_UNAVAILABLE');

    // The payment gate runs (and touches the wallet) in preHandler, before
    // the route's own handler ever calls the unreachable upstream — so the
    // wallet row exists regardless of the handler's later failure.
    const wallet = await ctx.db.wallets.findByAddress('WALLET-invoke-unreachable');
    expect(wallet).not.toBeNull();
  });
}, 20_000);
