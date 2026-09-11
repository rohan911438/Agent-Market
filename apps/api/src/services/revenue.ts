/**
 * The arithmetic behind the revenue ledger, kept as small pure functions
 * (no I/O) precisely because bps-vs-percent and provider-share-vs-platform-cut
 * are the easiest things to get backwards here under time pressure — see
 * Phase 07 scope item 3.
 */

/**
 * `Payment.amountAtomic` is a stringified integer in the atomic units of
 * `Payment.asset`. Every payment on this platform settles in USDC (6
 * decimals) — the same assumption `x402-payment.ts` already makes for daily
 * spend caps — so this conversion is not asset-generic, just consistent with
 * the rest of the codebase.
 */
export function atomicToUsd(amountAtomic: string): number {
  return Number(amountAtomic) / 1_000_000;
}

/**
 * The provider's share of a settled payment. `payoutSplitBps` is the
 * provider's cut in basis points out of 10000 (default 8000 = 80%) — the
 * platform's take-rate is the remainder, never computed here to avoid two
 * places that can disagree about which side of the split is which.
 */
export function providerShareUsd(amountUsd: number, payoutSplitBps: number): number {
  return amountUsd * (payoutSplitBps / 10_000);
}

/** Convenience: goes straight from a settled payment's atomic amount to the provider's USD share. */
export function providerShareFromAtomic(amountAtomic: string, payoutSplitBps: number): number {
  return providerShareUsd(atomicToUsd(amountAtomic), payoutSplitBps);
}

/** UTC calendar month start, consistent with how x402-payment.ts computes "daily spend" in UTC. */
export function currentUtcMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
