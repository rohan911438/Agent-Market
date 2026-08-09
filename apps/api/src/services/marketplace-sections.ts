/**
 * Pure helpers behind the marketplace storefront's computed fields (Phase
 * 10): "New" eligibility and the pricing-unit display fix. No I/O — the
 * route (marketplace.route.ts) gathers the real data (publish dates, call
 * counts) and calls these, same discipline as trust-score.ts and
 * analytics.ts.
 */

const NEW_WINDOW_DAYS = 14;

/**
 * True when `date` falls within the last `windowDays` days (default 14) —
 * the "New" shelf's eligibility rule. A null date (never published, or no
 * createdAt available) is never "new". A future date is also never "new"
 * rather than treated as infinitely fresh — it shouldn't happen in
 * practice, but the rule stays honest either way.
 */
export function isRecentlyPublished(date: Date | null, now: Date = new Date(), windowDays: number = NEW_WINDOW_DAYS): boolean {
  if (!date) return false;
  const ageMs = now.getTime() - date.getTime();
  return ageMs >= 0 && ageMs <= windowDays * 24 * 60 * 60 * 1000;
}

/**
 * The full price display string for a listing — the fix for the
 * marketplace UI previously hardcoding "/ call" regardless of
 * `pricingModel`. Computed here (not in the frontend) so it has exactly one
 * implementation and one test suite instead of drifting between the API
 * and the UI.
 */
export function formatPriceLabel(priceUsd: number, pricingModel: string): string {
  const amount = `$${priceUsd.toFixed(2)}`;
  switch (pricingModel) {
    case 'subscription':
      return `${amount} / month`;
    case 'bundle':
      return `${amount} one-time`;
    case 'pay_per_call':
    default:
      return `${amount} / call`;
  }
}
