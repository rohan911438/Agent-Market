import { describe, expect, it, vi } from 'vitest';
import { searchCapabilities } from './capability-search.js';
import type { CapabilitySearchResult } from './types.js';

const RESULTS: CapabilitySearchResult[] = [
  {
    listing: {
      id: '1',
      slug: 'chainscan-wallet-risk',
      name: 'ChainScan Wallet Risk',
      description: 'Flags risky wallets before a payout',
      category: 'Risk & Compliance',
      priceUsd: 0.03,
      endpoint: 'https://api.ledgerwatch.example',
      status: 'beta',
      isThirdParty: true,
    },
    score: 52.4,
    reasons: ['matches keywords: wallet, risk, payout', 'provider trust score: 45/100'],
  },
];

describe('searchCapabilities', () => {
  it('POSTs the task and constraints to /v1/discover and returns the ranked results', async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://fake.local/v1/discover');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({
        task: 'flag wallets with elevated risk before a payout',
        constraints: { maxCostPerCall: 0.05 },
      });
      return new Response(JSON.stringify({ results: RESULTS }), { status: 200 });
    });

    const results = await searchCapabilities(fetchImpl as unknown as typeof fetch, 'http://fake.local', {
      task: 'flag wallets with elevated risk before a payout',
      constraints: { maxCostPerCall: 0.05 },
    });

    expect(results).toEqual(RESULTS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('round-trips without constraints', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as typeof fetch;
    const results = await searchCapabilities(fetchImpl, 'http://fake.local', { task: 'anything' });
    expect(results).toEqual([]);
  });

  it('throws a structured error when the server rejects the request', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'task is required' } }), {
        status: 400,
      })) as unknown as typeof fetch;

    await expect(searchCapabilities(fetchImpl, 'http://fake.local', { task: '' })).rejects.toThrow(/task is required/);
  });
});
