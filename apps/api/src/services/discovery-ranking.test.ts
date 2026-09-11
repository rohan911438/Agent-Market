import { describe, expect, it } from 'vitest';
import { DISCOVERY_WEIGHTS, scoreCandidates, type DiscoveryCandidate } from './discovery-ranking.js';

function candidate(over: Partial<DiscoveryCandidate>): DiscoveryCandidate {
  return {
    listingId: 'x',
    name: 'Listing',
    description: 'A listing.',
    tags: [],
    priceUsd: 0.03,
    trustScore: null,
    latencyMsP95: null,
    ...over,
  };
}

describe('scoreCandidates — relevance ranking', () => {
  it('ranks the closely-matching listing first among a fixture with known expected ordering', () => {
    const catalog: DiscoveryCandidate[] = [
      candidate({
        listingId: 'wallet-risk',
        name: 'ChainScan Wallet Risk',
        description: 'Flags wallets with elevated on-chain risk before a payout, scored from live transaction graphs.',
        tags: ['wallets', 'fraud', 'on-chain'],
        priceUsd: 0.03,
      }),
      candidate({
        listingId: 'sentiment',
        name: 'Sentiment',
        description: 'Fear and Greed index plus optional news sentiment, normalized into one score.',
        priceUsd: 0.02,
      }),
      candidate({
        listingId: 'portfolio-health',
        name: 'Portfolio Health',
        description: 'Diversification and risk scoring for a set of holdings across multiple assets.',
        priceUsd: 0.04,
      }),
    ];

    const ranked = scoreCandidates('flag wallets with elevated risk before a payout', catalog);

    expect(ranked.map((r) => r.listingId)).toEqual(['wallet-risk', 'portfolio-health', 'sentiment']);
    expect(ranked[0]?.reasons.some((r) => r.startsWith('matches keywords:'))).toBe(true);
  });

  it('gives every candidate a non-negative score and a reasons array, even at zero relevance', () => {
    const ranked = scoreCandidates('completely unrelated query about weather forecasting', [
      candidate({ listingId: 'a', name: 'Sentiment', description: 'Fear and Greed index.' }),
    ]);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(ranked[0]?.reasons)).toBe(true);
  });
});

describe('scoreCandidates — maxCostPerCall (hard exclusion)', () => {
  const catalog: DiscoveryCandidate[] = [
    candidate({ listingId: 'cheap', name: 'Cheap Listing', description: 'A cheap listing.', priceUsd: 0.01 }),
    candidate({ listingId: 'expensive', name: 'Expensive Listing', description: 'An expensive listing.', priceUsd: 0.5 }),
  ];

  it('includes a listing priced at or below the ceiling', () => {
    const ranked = scoreCandidates('listing', catalog, { maxCostPerCall: 0.01 });
    expect(ranked.map((r) => r.listingId)).toContain('cheap');
  });

  it('excludes a listing priced above the ceiling — not merely down-ranked, absent entirely', () => {
    const ranked = scoreCandidates('listing', catalog, { maxCostPerCall: 0.01 });
    expect(ranked.map((r) => r.listingId)).not.toContain('expensive');
    expect(ranked).toHaveLength(1);
  });

  it('includes every candidate when no cost constraint is given', () => {
    const ranked = scoreCandidates('listing', catalog);
    expect(ranked).toHaveLength(2);
  });
});

describe('scoreCandidates — trust weighting', () => {
  it('lets a highly-trusted listing outrank an identically-relevant, unverified one — a pure tie-break', () => {
    // Identical name/description/tags -> identical relevance score by construction;
    // trustScore is the only variable, isolating the trust term exactly.
    const shared = { name: 'Wallet Risk Analyzer', description: 'Analyze wallet risk before a payout.' };
    const catalog: DiscoveryCandidate[] = [
      candidate({ listingId: 'untrusted', ...shared, trustScore: null }),
      candidate({ listingId: 'trusted', ...shared, trustScore: 100 }),
    ];

    const ranked = scoreCandidates('analyze wallet risk before a payout', catalog);
    expect(ranked[0]?.listingId).toBe('trusted');
    expect(ranked[1]?.listingId).toBe('untrusted');
    expect(ranked[0]!.score - ranked[1]!.score).toBeCloseTo(DISCOVERY_WEIGHTS.trust, 5);
  });

  it('does not let trust override a large relevance gap', () => {
    const task = 'flag wallets with elevated on-chain risk before a payout';
    const catalog: DiscoveryCandidate[] = [
      candidate({
        listingId: 'highly-relevant-untrusted',
        name: 'ChainScan Wallet Risk',
        description: 'Flags wallets with elevated on-chain risk before a payout.',
        tags: ['wallets', 'fraud', 'on-chain'],
        trustScore: null,
      }),
      candidate({
        listingId: 'irrelevant-fully-trusted',
        name: 'Unrelated Weather API',
        description: 'Historical weather data for a given city.',
        trustScore: 100, // the maximum possible trust contribution (30 pts) still can't beat a strong relevance match
      }),
    ];

    const ranked = scoreCandidates(task, catalog);
    expect(ranked[0]?.listingId).toBe('highly-relevant-untrusted');
  });

  it('contributes exactly trustScore/100 * 30 points, and 0 (neutral) when trustScore is null', () => {
    const withTrust = scoreCandidates('x', [candidate({ listingId: 'a', trustScore: 60 })]);
    const withoutTrust = scoreCandidates('x', [candidate({ listingId: 'a', trustScore: null })]);
    expect(withTrust[0]!.score - withoutTrust[0]!.score).toBeCloseTo((60 / 100) * DISCOVERY_WEIGHTS.trust, 5);
  });
});

describe('scoreCandidates — latency constraint (soft penalty)', () => {
  // A real task/description match so the baseline relevance score is well above
  // the 10-point penalty — otherwise the score-floor-at-0 would mask the penalty's exact size.
  const task = 'reliable market data endpoint';
  const relevant = { name: 'Market Data Endpoint', description: 'A reliable market data endpoint.' };

  it('penalizes a listing whose real p95 latency exceeds maxLatencyMs, without excluding it', () => {
    const catalog: DiscoveryCandidate[] = [candidate({ listingId: 'slow', ...relevant, latencyMsP95: 900 })];

    const withoutConstraint = scoreCandidates(task, catalog);
    const withConstraint = scoreCandidates(task, catalog, { maxLatencyMs: 500 });

    expect(withConstraint).toHaveLength(1); // still present — soft penalty, not exclusion
    expect(withConstraint[0]!.score).toBeCloseTo(withoutConstraint[0]!.score - DISCOVERY_WEIGHTS.latencyPenalty, 5);
    expect(withConstraint[0]?.reasons.some((r) => r.includes('exceeds latency constraint'))).toBe(true);
  });

  it('does not penalize a listing within the latency constraint', () => {
    const catalog: DiscoveryCandidate[] = [candidate({ listingId: 'fast', ...relevant, latencyMsP95: 100 })];
    const withoutConstraint = scoreCandidates(task, catalog);
    const withConstraint = scoreCandidates(task, catalog, { maxLatencyMs: 500 });
    expect(withConstraint[0]!.score).toBeCloseTo(withoutConstraint[0]!.score, 5);
    expect(withConstraint[0]?.reasons.some((r) => r.includes('within latency constraint'))).toBe(true);
  });

  it('treats missing latency data as neutral — never a penalty — even when a constraint is given', () => {
    const catalog: DiscoveryCandidate[] = [candidate({ listingId: 'no-data', ...relevant, latencyMsP95: null })];
    const withoutConstraint = scoreCandidates(task, catalog);
    const withConstraint = scoreCandidates(task, catalog, { maxLatencyMs: 1 }); // an impossibly tight ceiling
    expect(withConstraint[0]!.score).toBeCloseTo(withoutConstraint[0]!.score, 5);
    expect(withConstraint[0]?.reasons.some((r) => r.includes('latency'))).toBe(false);
  });
});

describe('scoreCandidates — determinism', () => {
  it('returns the same ranking for the same input', () => {
    const catalog: DiscoveryCandidate[] = [
      candidate({ listingId: 'a', name: 'Risk Analysis', description: 'Volatility and drawdown scoring.' }),
      candidate({ listingId: 'b', name: 'Sentiment', description: 'Fear and Greed index.' }),
    ];
    const first = scoreCandidates('volatility risk', catalog);
    const second = scoreCandidates('volatility risk', catalog);
    expect(first).toEqual(second);
  });
});
