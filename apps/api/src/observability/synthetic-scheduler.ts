import type { AppContext } from '../context.js';
import { FIRST_PARTY_SYNTHETIC_TARGET } from '../services/availability.js';
import { checkFirstPartyAvailability, checkThirdPartyListing } from './synthetic-checks.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * A simple `setInterval`-based internal scheduler — the repo has no
 * existing cron/job-queue convention, and this scale (probing a handful of
 * endpoints every few minutes) doesn't justify introducing one. Runs once
 * immediately, then on the interval, until `stop()` is called.
 *
 * Deliberately only ever started from main.ts — never from
 * build-context.ts/buildServer, so every test (which builds a server
 * directly) never triggers a real background job or a real outbound HTTP
 * call to a listing's `upstreamUrl`.
 */
export function startSyntheticMonitor(ctx: AppContext, intervalMs = DEFAULT_INTERVAL_MS): () => void {
  async function checkFirstParty(): Promise<void> {
    try {
      const result = await checkFirstPartyAvailability(ctx);
      await ctx.db.syntheticChecks.record({
        target: FIRST_PARTY_SYNTHETIC_TARGET,
        targetType: 'first_party',
        success: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
      });
    } catch (err) {
      console.error('synthetic monitor: first-party check failed to record', err);
    }
  }

  async function checkThirdParty(): Promise<void> {
    let listings;
    try {
      listings = await ctx.db.apiListings.listPublished();
    } catch (err) {
      console.error('synthetic monitor: failed to load published listings', err);
      return;
    }

    await Promise.all(
      listings.map(async (listing) => {
        try {
          const result = await checkThirdPartyListing(listing.upstreamUrl);
          await ctx.db.syntheticChecks.record({
            target: listing.id,
            targetType: 'third_party',
            success: result.success,
            latencyMs: result.latencyMs,
            statusCode: result.statusCode,
            error: result.error,
          });
        } catch (err) {
          console.error(`synthetic monitor: check failed for listing ${listing.id}`, err);
        }
      }),
    );
  }

  async function runOnce(): Promise<void> {
    await Promise.all([checkFirstParty(), checkThirdParty()]);
  }

  void runOnce();
  const handle = setInterval(() => void runOnce(), intervalMs);
  handle.unref(); // never keeps the process alive solely for this timer

  return () => clearInterval(handle);
}
