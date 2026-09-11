import { describe, expect, it, vi } from 'vitest';
import { HttpError } from './errors.js';
import { publishCapability } from './publish-capability.js';

const BASE_URL = 'http://fake.local';
const WALLET = 'A'.repeat(58);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function errorResponse(code: string, message: string, status: number, details?: unknown): Response {
  return jsonResponse({ error: { code, message, requestId: 'req-1', details } }, status);
}

const input = {
  provider: { name: 'Sentiment Bot', email: 'bot@example.test', walletAddress: WALLET },
  listing: {
    slug: 'sentiment-bot-feed',
    name: 'Sentiment Bot Feed',
    description: 'A self-listed capability published by an autonomous agent.',
    category: 'Sentiment',
    upstreamUrl: 'https://sentiment-bot.example.test/v1',
  },
  priceUsd: 0.02,
};

describe('publishCapability', () => {
  it('drives the full register -> verify -> create -> price -> pay -> publish sequence', async () => {
    const calls: { url: string; method: string; body: unknown; auth: string | null; contentType: string | null }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      // A bodyless request carrying `content-type: application/json` anyway
      // is exactly the real bug this regression check exists for: Fastify's
      // default JSON body parser rejects it outright ("Body cannot be empty
      // when content-type is set to 'application/json'") — confirmed
      // against a real running server, not just this mock, which (unlike
      // Fastify) doesn't itself enforce the rule.
      if (!init?.body && headers?.['content-type']) {
        throw new Error(`bodyless request to ${url} must not set content-type (Fastify rejects this for real)`);
      }
      const record = {
        url: url.toString(),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : undefined,
        auth: headers?.authorization ?? null,
        contentType: headers?.['content-type'] ?? null,
      };
      calls.push(record);

      if (record.url.endsWith('/v1/providers/register')) {
        return jsonResponse({ providerId: 'prov-1', status: 'pending', apiKey: 'sk_test_123' }, 201);
      }
      if (record.url.endsWith('/v1/providers/verify')) {
        return jsonResponse({ id: 'prov-1', status: 'verified' });
      }
      if (record.url.endsWith('/v1/listings')) {
        return jsonResponse({ id: 'listing-1', slug: input.listing.slug, status: 'draft', protocolDocs: null }, 201);
      }
      if (record.url.endsWith('/v1/listings/listing-1/pricing')) {
        return jsonResponse({ id: 'listing-1', status: 'draft', priceUsd: input.priceUsd });
      }
      if (record.url.endsWith('/v1/listings/listing-1/payment')) {
        return jsonResponse({ id: 'listing-1', status: 'draft', payoutWalletAddress: WALLET });
      }
      if (record.url.endsWith('/v1/listings/listing-1/publish')) {
        return jsonResponse({
          id: 'listing-1',
          slug: input.listing.slug,
          status: 'published',
          protocolDocs: { openapiUrl: '/x', docsUrl: '/y', postmanUrl: '/z' },
        });
      }
      throw new Error(`unexpected call: ${record.method} ${record.url}`);
    });

    const result = await publishCapability(fetchImpl as unknown as typeof fetch, BASE_URL, input);

    expect(result).toEqual({
      apiKey: 'sk_test_123',
      providerId: 'prov-1',
      listing: {
        id: 'listing-1',
        slug: input.listing.slug,
        status: 'published',
        protocolDocs: { openapiUrl: '/x', docsUrl: '/y', postmanUrl: '/z' },
      },
    });

    // Exact sequence, and every authenticated call carries the apiKey issued by registration.
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'POST /v1/providers/register',
      'POST /v1/providers/verify',
      'POST /v1/listings',
      'PATCH /v1/listings/listing-1/pricing',
      'PATCH /v1/listings/listing-1/payment',
      'POST /v1/listings/listing-1/publish',
    ]);
    for (const call of calls.slice(1)) {
      expect(call.auth).toBe('Bearer sk_test_123');
    }
    expect(calls[3]!.body).toEqual({ pricingModel: 'pay_per_call', priceUsd: 0.02 });
    // No payoutWalletAddress given — defaults to the provider's own registration wallet.
    expect(calls[4]!.body).toMatchObject({ payoutWalletAddress: WALLET });
    // The two bodyless calls (verify, publish) must not set content-type — see the mock's own check above.
    expect(calls[1]!.contentType).toBeNull();
    expect(calls[5]!.contentType).toBeNull();
  });

  it('defaults the payout wallet to the provider wallet but respects an explicit override', async () => {
    const payoutWallet = 'B'.repeat(58);
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/v1/providers/register') return jsonResponse({ providerId: 'p', apiKey: 'k' }, 201);
      if (path === '/v1/providers/verify') return jsonResponse({});
      if (path === '/v1/listings') return jsonResponse({ id: 'l' }, 201);
      if (path === '/v1/listings/l/pricing') return jsonResponse({});
      if (path === '/v1/listings/l/payment') {
        expect(JSON.parse(init!.body as string)).toEqual({ payoutWalletAddress: payoutWallet, payoutSplitBps: undefined });
        return jsonResponse({});
      }
      if (path === '/v1/listings/l/publish') return jsonResponse({ id: 'l', status: 'published' });
      throw new Error(`unexpected ${path}`);
    });

    await publishCapability(fetchImpl as unknown as typeof fetch, BASE_URL, { ...input, payoutWalletAddress: payoutWallet });
  });

  it('surfaces the exact unmet-requirements detail when publish is rejected', async () => {
    const requirements = [{ key: 'provider_verified', met: false, message: 'Provider account must pass verification.' }];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path === '/v1/providers/register') return jsonResponse({ providerId: 'p', apiKey: 'k' }, 201);
      if (path === '/v1/providers/verify') return jsonResponse({});
      if (path === '/v1/listings') return jsonResponse({ id: 'l' }, 201);
      if (path === '/v1/listings/l/pricing') return jsonResponse({});
      if (path === '/v1/listings/l/payment') return jsonResponse({});
      if (path === '/v1/listings/l/publish') {
        return errorResponse('PUBLISH_REQUIREMENTS_NOT_MET', 'This listing does not meet the publish requirements yet.', 422, {
          requirements,
        });
      }
      throw new Error(`unexpected ${path}`);
    });

    await expect(publishCapability(fetchImpl as unknown as typeof fetch, BASE_URL, input)).rejects.toMatchObject({
      serverCode: 'PUBLISH_REQUIREMENTS_NOT_MET',
      details: { requirements },
    });
  });

  it('stops immediately if provider registration itself fails, never attempting later steps', async () => {
    const fetchImpl = vi.fn(async () => errorResponse('CONFLICT', 'A provider with this email already exists.', 409));

    await expect(publishCapability(fetchImpl as unknown as typeof fetch, BASE_URL, input)).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
