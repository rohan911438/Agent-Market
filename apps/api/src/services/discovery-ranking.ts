/**
 * AI Discovery (Phase 11) — ranks the catalog against a free-text task
 * description plus optional constraints. Deliberately NOT a trained or
 * learned model, and NOT calling out to an external embeddings/LLM API:
 * no such dependency was confirmed available/approved for this environment
 * (see the phase's implementation notes), so relevance is scored with plain
 * TF-IDF cosine similarity over the catalog itself — a legitimate,
 * dependency-free, fully inspectable v1. Upgrade to real embeddings later
 * if/when that's actually available and worth the added dependency.
 *
 * The combined score is documented here in full, not spread across the
 * codebase — if the formula needs to change, change the numbers below (and
 * this comment):
 *
 *   - Relevance (TF-IDF cosine similarity of task vs. name+description+tags),
 *     scaled to 0-60 points. This is the dominant term — discovery is
 *     fundamentally about matching the stated task.
 *   - Trust (Phase 08's trustScore / 100), scaled to 0-30 points. A highly
 *     trusted listing can outrank a marginally-more-relevant one, but 30
 *     points can never fully overcome a large relevance gap out of 60.
 *     First-party endpoints have no ProviderAccount and so no trust score
 *     (`trustScore: null`) — contributes 0, neither rewarded nor penalized,
 *     same "no data is neutral" rule Phase 09/10 already use.
 *   - Latency constraint fit: a SOFT penalty of -10 points when real p95
 *     latency data exists (Phase 09) for that listing and it exceeds
 *     `constraints.maxLatencyMs`. No data -> neutral (0), never treated as
 *     "bad". No constraint given -> not scored at all.
 *   - Cost constraint fit: a HARD exclusion. `constraints.maxCostPerCall` is
 *     a real budget ceiling an agent cannot exceed, not a soft preference —
 *     listings priced above it are removed from the results entirely rather
 *     than merely down-ranked (this is the one constraint the phase spec
 *     explicitly calls out as hard-requirement-shaped).
 *
 * Max combined score is 90 (60 relevance + 30 trust); the latency penalty
 * can pull it lower. Final score is floored at 0.
 */

export const DISCOVERY_WEIGHTS = {
  relevance: 60,
  trust: 30,
  latencyPenalty: 10,
} as const;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'be', 'before', 'after', 'this', 'that', 'it', 'at', 'by',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  for (const [term, count] of tf) tf.set(term, count / total);
  return tf;
}

/** Smoothed IDF over the candidate corpus (add-one smoothing so a term appearing in every document, or in none, never produces a zero/negative weight). */
function buildIdf(corpusTokens: string[][]): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const tokens of corpusTokens) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const documentCount = corpusTokens.length;
  const idf = new Map<string, number>();
  for (const [term, df] of documentFrequency) {
    idf.set(term, Math.log((documentCount + 1) / (df + 1)) + 1);
  }
  return idf;
}

const DEFAULT_IDF_FOR_UNSEEN_TERM = Math.log(2) + 1;

function tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = termFrequencies(tokens);
  const vector = new Map<string, number>();
  for (const [term, freq] of tf) vector.set(term, freq * (idf.get(term) ?? DEFAULT_IDF_FOR_UNSEEN_TERM));
  return vector;
}

function magnitude(vector: Map<string, number>): number {
  let sumSquares = 0;
  for (const v of vector.values()) sumSquares += v * v;
  return Math.sqrt(sumSquares);
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  let dot = 0;
  for (const [term, va] of a) {
    const vb = b.get(term);
    if (vb) dot += va * vb;
  }
  return dot / (magA * magB);
}

export interface DiscoveryCandidate {
  listingId: string;
  name: string;
  description: string;
  tags: string[];
  priceUsd: number;
  /** null for first-party endpoints, which have no ProviderAccount / trust ladder — see the module comment. */
  trustScore: number | null;
  /** Real p95 latency over a recent window (Phase 09 data), or null when no traffic has been observed yet. */
  latencyMsP95: number | null;
}

export interface DiscoveryConstraints {
  maxLatencyMs?: number;
  maxCostPerCall?: number;
}

export interface DiscoveryScoredResult {
  listingId: string;
  score: number;
  reasons: string[];
}

/**
 * Scores and ranks `candidates` against `task`. Candidates violating a hard
 * `maxCostPerCall` ceiling are excluded from the returned array entirely
 * (never merely down-ranked) — see the module comment for why cost, alone
 * among the constraints, is treated as a hard requirement.
 */
export function scoreCandidates(
  task: string,
  candidates: DiscoveryCandidate[],
  constraints: DiscoveryConstraints = {},
): DiscoveryScoredResult[] {
  const survivors =
    constraints.maxCostPerCall !== undefined
      ? candidates.filter((c) => c.priceUsd <= constraints.maxCostPerCall!)
      : candidates;

  const corpusTokens = survivors.map((c) => tokenize(`${c.name} ${c.description} ${c.tags.join(' ')}`));
  const idf = buildIdf(corpusTokens);
  const taskTokens = tokenize(task);
  const taskVector = tfidfVector(taskTokens, idf);
  const taskTermSet = new Set(taskTokens);

  const results = survivors.map((candidate, i) => {
    const docTokens = corpusTokens[i] ?? [];
    const docVector = tfidfVector(docTokens, idf);
    const relevance = cosineSimilarity(taskVector, docVector); // 0..1

    const reasons: string[] = [];
    let score = relevance * DISCOVERY_WEIGHTS.relevance;

    const matchedTerms = [...new Set(docTokens)].filter((t) => taskTermSet.has(t));
    if (matchedTerms.length > 0) {
      reasons.push(`matches keywords: ${matchedTerms.slice(0, 5).join(', ')}`);
    }

    if (candidate.trustScore !== null) {
      score += (candidate.trustScore / 100) * DISCOVERY_WEIGHTS.trust;
      reasons.push(`provider trust score: ${candidate.trustScore}/100`);
    }

    if (constraints.maxLatencyMs !== undefined && candidate.latencyMsP95 !== null) {
      if (candidate.latencyMsP95 > constraints.maxLatencyMs) {
        score -= DISCOVERY_WEIGHTS.latencyPenalty;
        reasons.push(`exceeds latency constraint (${candidate.latencyMsP95}ms > ${constraints.maxLatencyMs}ms)`);
      } else {
        reasons.push(`within latency constraint (${candidate.latencyMsP95}ms <= ${constraints.maxLatencyMs}ms)`);
      }
    }

    if (constraints.maxCostPerCall !== undefined) {
      reasons.push(`within cost constraint ($${candidate.priceUsd.toFixed(2)} <= $${constraints.maxCostPerCall.toFixed(2)})`);
    }

    return { listingId: candidate.listingId, score: Math.max(0, Math.round(score * 100) / 100), reasons };
  });

  return results.sort((a, b) => b.score - a.score);
}
