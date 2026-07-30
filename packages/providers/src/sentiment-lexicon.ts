const POSITIVE_WORDS = [
  'surge',
  'rally',
  'bullish',
  'gain',
  'soar',
  'record',
  'adoption',
  'upgrade',
  'inflow',
  'breakout',
  'recover',
];

const NEGATIVE_WORDS = [
  'crash',
  'plunge',
  'bearish',
  'loss',
  'selloff',
  'sell-off',
  'hack',
  'ban',
  'lawsuit',
  'outflow',
  'collapse',
  'fear',
];

/**
 * Lightweight keyword-based sentiment score from headlines, in [-1, 1].
 * Deliberately dependency-free (no LLM call) — this is a real signal used
 * by the RuleBasedExplainer, not a placeholder; an LLM-backed sentiment
 * source can be added later behind the same NewsSentimentProviderAdapter shape.
 */
export function naiveSentimentFromHeadlines(headlines: string[]): number {
  if (headlines.length === 0) return 0;
  let score = 0;
  for (const headline of headlines) {
    const lower = headline.toLowerCase();
    for (const word of POSITIVE_WORDS) if (lower.includes(word)) score += 1;
    for (const word of NEGATIVE_WORDS) if (lower.includes(word)) score -= 1;
  }
  return Math.max(-1, Math.min(1, score / headlines.length));
}
