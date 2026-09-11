import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf-8'),
) as { version: string };

const FACILITATOR_TIMEOUT_MS = 2000;
const CACHE_PROBE_KEY = '__health_check__';

type DependencyStatus = 'ok' | 'error';

interface DependencyResult {
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

async function checkDatabase(ctx: AppContext): Promise<DependencyResult> {
  const start = Date.now();
  try {
    await ctx.db.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, error: errorMessage(err) };
  }
}

async function checkCache(ctx: AppContext): Promise<DependencyResult> {
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
async function checkFacilitator(ctx: AppContext): Promise<DependencyResult | undefined> {
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

export function registerHealthRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/health', async (_request, reply) => {
    const [database, cache, facilitator] = await Promise.all([
      checkDatabase(ctx),
      checkCache(ctx),
      checkFacilitator(ctx),
    ]);

    const dependencies: Record<string, DependencyResult> = { database, cache };
    if (facilitator) dependencies.facilitator = facilitator;

    const healthy = database.status === 'ok' && cache.status === 'ok';

    reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'error',
      version,
      timestamp: new Date().toISOString(),
      dependencies,
    });
  });
}
