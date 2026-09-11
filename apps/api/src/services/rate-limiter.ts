import type { ICache } from '@agentmarket/cache';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/**
 * Token-bucket limiter backed by ICache — continuously refills at
 * `limitPerMinute / 60_000` tokens/ms rather than resetting on a fixed
 * window boundary, so a burst right at a window edge can't double a
 * client's effective rate. State lives in the shared cache (MemoryCache by
 * default, Redis-ready) so it works the same under multi-process
 * deployment once CACHE_DRIVER=redis is set.
 */
export class RateLimiterService {
  constructor(private readonly cache: ICache) {}

  async consume(identifier: string, limitPerMinute: number): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const refillPerMs = limitPerMinute / 60_000;

    const state = (await this.cache.get<BucketState>(key)) ?? { tokens: limitPerMinute, lastRefillMs: now };
    const elapsedMs = Math.max(0, now - state.lastRefillMs);
    const refilled = Math.min(limitPerMinute, state.tokens + elapsedMs * refillPerMs);

    const allowed = refilled >= 1;
    const tokensAfter = allowed ? refilled - 1 : refilled;

    await this.cache.set(key, { tokens: tokensAfter, lastRefillMs: now }, 120);

    return {
      allowed,
      limit: limitPerMinute,
      remaining: Math.floor(tokensAfter),
      resetSeconds: allowed ? 0 : Math.max(1, Math.ceil((1 - tokensAfter) / refillPerMs / 1000)),
    };
  }
}
