import type { AppContext } from '../context.js';
import { checkOverallHealth } from './health-checks.js';

export interface SyntheticCheckOutcome {
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

const THIRD_PARTY_PROBE_TIMEOUT_MS = 5000;

/** Reuses the same dependency checks GET /health runs — one implementation, not a duplicate (see health-checks.ts). */
export async function checkFirstPartyAvailability(ctx: AppContext): Promise<SyntheticCheckOutcome> {
  const start = Date.now();
  const { healthy } = await checkOverallHealth(ctx);
  return { success: healthy, latencyMs: Date.now() - start };
}

/**
 * Probes a third-party listing's declared `upstreamUrl` — only as
 * meaningful as the provider's own infrastructure, since no gateway routes
 * real traffic there yet (see the SyntheticCheck model's schema comment).
 * `fetchImpl` is injectable so tests never make a real network call —
 * mirrors the SDK's `fetchImpl` override pattern (packages/agent-sdk).
 */
export async function checkThirdPartyListing(upstreamUrl: string, fetchImpl: typeof fetch = fetch): Promise<SyntheticCheckOutcome> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), THIRD_PARTY_PROBE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(upstreamUrl, { method: 'HEAD', signal: controller.signal });
    return { success: res.ok, latencyMs: Date.now() - start, statusCode: res.status };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : 'unknown error' };
  } finally {
    clearTimeout(timeout);
  }
}
