import { describe, expect, it } from 'vitest';
import { discoverListings } from './discovery.js';
import type { MarketplaceListing } from './types.js';

const CATALOG: MarketplaceListing[] = [
  { id: '1', slug: 'risk-analysis', name: 'Risk Analysis', description: 'Volatility and drawdown scoring', category: 'Financial Intelligence', priceUsd: 0.03, endpoint: '/v1/risk-analysis', status: 'live' },
  { id: '2', slug: 'chainscan-wallet-risk', name: 'ChainScan Wallet Risk', description: 'Flags risky wallets before a payout', category: 'Risk & Compliance', priceUsd: 0.03, endpoint: 'https://api.ledgerwatch.example', status: 'beta', isThirdParty: true },
  { id: '3', slug: 'sentiment', name: 'Sentiment', description: 'Fear & Greed index', category: 'Financial Intelligence', priceUsd: 0.02, endpoint: '/v1/sentiment', status: 'live' },
];

function fetchWithCatalog(): typeof fetch {
  return (async () => new Response(JSON.stringify({ apis: CATALOG }), { status: 200 })) as unknown as typeof fetch;
}

describe('discoverListings', () => {
  it('returns every listing sorted by price ascending with no filters', async () => {
    const listings = await discoverListings(fetchWithCatalog(), 'http://fake.local');
    expect(listings.map((l) => l.slug)).toEqual(['sentiment', 'risk-analysis', 'chainscan-wallet-risk']);
  });

  it('filters by category (case-insensitive)', async () => {
    const listings = await discoverListings(fetchWithCatalog(), 'http://fake.local', { category: 'risk & compliance' });
    expect(listings).toHaveLength(1);
    expect(listings[0]?.slug).toBe('chainscan-wallet-risk');
  });

  it('filters by a price ceiling', async () => {
    const listings = await discoverListings(fetchWithCatalog(), 'http://fake.local', { maxPriceUsd: 0.02 });
    expect(listings.map((l) => l.slug)).toEqual(['sentiment']);
  });

  it('filters by a case-insensitive substring search over name + description', async () => {
    const listings = await discoverListings(fetchWithCatalog(), 'http://fake.local', { search: 'wallet' });
    expect(listings.map((l) => l.slug)).toEqual(['chainscan-wallet-risk']);
  });

  it('throws when the marketplace endpoint is unreachable', async () => {
    const failing = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(discoverListings(failing, 'http://fake.local')).rejects.toThrow(/HTTP 500/);
  });
});
