import { createCache } from '@agentmarket/cache';
import type { ApiListing } from '@prisma/client';
import { AppError } from '@rohankumar4179/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeUpstreamUrl,
  buildUpstreamRequest,
  invokeUpstreamListing,
  invokeUpstreamListingCached,
  resolveListingOperation,
} from './listing-invocation.js';

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Wallet Risk API', version: '1.0.0' },
  paths: {
    '/wallets/{address}/risk': {
      get: {
        operationId: 'getWalletRisk',
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'verbose', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/reports': {
      post: {
        operationId: 'createReport',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
  },
});

function listing(overrides: Partial<ApiListing> = {}): ApiListing {
  return {
    id: 'listing-1',
    slug: 'wallet-risk',
    upstreamUrl: 'https://api.ledgerwatch.test/v1',
    parsedOpenApiSpec: SPEC,
    ...overrides,
  } as ApiListing;
}

describe('assertSafeUpstreamUrl', () => {
  it.each([
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://172.16.0.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/x',
  ])('blocks %s', (url) => {
    expect(() => assertSafeUpstreamUrl(new URL(url))).toThrow(AppError);
  });

  it('blocks a non-http(s) protocol', () => {
    expect(() => assertSafeUpstreamUrl(new URL('file:///etc/passwd'))).toThrow(AppError);
  });

  it('allows a normal public https host', () => {
    expect(() => assertSafeUpstreamUrl(new URL('https://api.ledgerwatch.test/v1/x'))).not.toThrow();
  });
});

describe('resolveListingOperation', () => {
  it('finds the named operation', () => {
    const op = resolveListingOperation(listing(), 'getWalletRisk');
    expect(op.path).toBe('/wallets/{address}/risk');
    expect(op.method).toBe('get');
  });

  it('throws NOT_FOUND for an unknown operationId', () => {
    expect(() => resolveListingOperation(listing(), 'doesNotExist')).toThrow(/Unknown operation/);
  });

  it('throws for a listing with no spec on file', () => {
    expect(() => resolveListingOperation(listing({ parsedOpenApiSpec: null }), 'getWalletRisk')).toThrow(AppError);
  });
});

describe('buildUpstreamRequest', () => {
  it('substitutes a required path param and puts remaining params in the query string', () => {
    const op = resolveListingOperation(listing(), 'getWalletRisk');
    const { url, init } = buildUpstreamRequest(listing(), op, { address: 'ABC123', verbose: true });
    expect(url.toString()).toBe('https://api.ledgerwatch.test/v1/wallets/ABC123/risk?verbose=true');
    expect(init.method).toBe('GET');
  });

  it('URL-encodes a path param so a value cannot smuggle extra path segments', () => {
    const op = resolveListingOperation(listing(), 'getWalletRisk');
    const { url } = buildUpstreamRequest(listing(), op, { address: '../../secret' });
    expect(url.pathname).toBe('/v1/wallets/..%2F..%2Fsecret/risk');
  });

  it('throws VALIDATION_ERROR when a required path param is missing', () => {
    const op = resolveListingOperation(listing(), 'getWalletRisk');
    expect(() => buildUpstreamRequest(listing(), op, {})).toThrow(AppError);
  });

  it('sends remaining params as a JSON body for a POST operation', () => {
    const op = resolveListingOperation(listing(), 'createReport');
    const { url, init } = buildUpstreamRequest(listing(), op, { note: 'hello' });
    expect(url.toString()).toBe('https://api.ledgerwatch.test/v1/reports');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ note: 'hello' }));
  });

  it('rejects a listing whose upstreamUrl points at a blocked address even when the operation itself is well-formed', () => {
    const badListing = listing({ upstreamUrl: 'http://169.254.169.254/v1' });
    const op = resolveListingOperation(badListing, 'createReport');
    expect(() => buildUpstreamRequest(badListing, op, {})).toThrow(AppError);
  });
});

describe('invokeUpstreamListing', () => {
  it('calls the resolved URL and parses a JSON response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ score: 42 }), { status: 200 }));
    const result = await invokeUpstreamListing(listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl);
    expect(result).toEqual({ statusCode: 200, body: { score: 42 } });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.ledgerwatch.test/v1/wallets/ABC123/risk',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('propagates a non-2xx upstream status without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 503 }));
    const result = await invokeUpstreamListing(listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl);
    expect(result.statusCode).toBe(503);
  });

  it('maps a network failure to PROVIDER_UNAVAILABLE', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(invokeUpstreamListing(listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl)).rejects.toThrow(AppError);
  });
});

describe('invokeUpstreamListingCached', () => {
  it('caches a GET operation — a second identical call never reaches the upstream', async () => {
    const cache = createCache('memory');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ score: 42 }), { status: 200 }));

    const first = await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl);
    const second = await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl);

    expect(first).toEqual({ statusCode: 200, body: { score: 42 }, cacheHit: false });
    expect(second).toEqual({ statusCode: 200, body: { score: 42 }, cacheHit: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a different params object as a cache miss', async () => {
    const cache = createCache('memory');
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ score: 42 }), { status: 200 }));

    await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl);
    await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { address: 'XYZ789' }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('is insensitive to param key order — the same logical call is still a cache hit', async () => {
    const cache = createCache('memory');
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ score: 42 }), { status: 200 }));

    await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { address: 'ABC123', verbose: true }, fetchImpl);
    const second = await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { verbose: true, address: 'ABC123' }, fetchImpl);

    expect(second.cacheHit).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never caches a non-2xx upstream response — the next call retries for real', async () => {
    const cache = createCache('memory');
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 503 }));

    const first = await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl);
    const second = await invokeUpstreamListingCached(cache, listing(), 'getWalletRisk', { address: 'ABC123' }, fetchImpl);

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never caches a non-safe (POST) operation — every call reaches the upstream', async () => {
    const cache = createCache('memory');
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: '1' }), { status: 201 }));

    const first = await invokeUpstreamListingCached(cache, listing(), 'createReport', { note: 'hi' }, fetchImpl);
    const second = await invokeUpstreamListingCached(cache, listing(), 'createReport', { note: 'hi' }, fetchImpl);

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
