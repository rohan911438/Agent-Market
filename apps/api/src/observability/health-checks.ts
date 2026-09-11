import type { AppContext } from '../context.js';

const FACILITATOR_TIMEOUT_MS = 2000;
const CACHE_PROBE_KEY = '__health_check__';

export type DependencyStatus = 'ok' | 'error';

export interface DependencyResult {
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

/**
 * Shared by GET /health (routes/health.route.ts) and the synthetic monitor
 * (observability/synthetic-checks.ts, Phase 13) — one implementation of
 * "is this dependency actually reachable", not a second copy.
 */
export async function checkDatabase(ctx: AppContext): Promise<DependencyResult> {
  const start = Date.now();
  try {
    await ctx.db.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, error: errorMessage(err) };
  }
}

export async function checkCache(ctx: AppContext): Promise<DependencyResult> {
  const start = Date.now();
  try {
    await ctx.cache.set(CACHE_PROBE_KEY, 'ok', 5);
    const value = await ctx.cache.get<string>(CACHE_PROBE_KEY);
    if (value !== 'ok') throw new Error('cache round-trip returned an unexpected value');
    await ctx.cache.del(CACHE_PROBE_KEY);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, error: errorMessage(err) };
  }
}

/**
 * Best-effort only — a slow or unreachable third-party facilitator is not a
 * reason to pull this instance out of rotation, so its result never affects
 * the overall status/status code.
 */
export async function checkFacilitator(ctx: AppContext): Promise<DependencyResult | undefined> {
  const { provider, facilitatorUrl } = ctx.config.payments;
  if (provider !== 'algorand-x402' || !facilitatorUrl) return undefined;

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FACILITATOR_TIMEOUT_MS);
  try {
    const res = await fetch(`${facilitatorUrl}/health`, { signal: controller.signal });
    return res.ok
      ? { status: 'ok', latencyMs: Date.now() - start }
      : { status: 'error', latencyMs: Date.now() - start, error: `facilitator responded ${res.status}` };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, error: errorMessage(err) };
  } finally {
    clearTimeout(timeout);
  }
}

export interface HealthCheckResult {
  healthy: boolean;
  dependencies: Record<string, DependencyResult>;
}

/** The full first-party dependency check — same result GET /health reports, reused by the synthetic monitor and (indirectly, via /health) the /status page. */
export async function checkOverallHealth(ctx: AppContext): Promise<HealthCheckResult> {
  const [database, cache, facilitator] = await Promise.all([checkDatabase(ctx), checkCache(ctx), checkFacilitator(ctx)]);

  const dependencies: Record<string, DependencyResult> = { database, cache };
  if (facilitator) dependencies.facilitator = facilitator;

  return { healthy: database.status === 'ok' && cache.status === 'ok', dependencies };
}
