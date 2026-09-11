import type { ICache } from './types.js';

/** The minimal surface RedisCache needs — satisfied by ioredis, node-redis, etc. */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/**
 * Redis-backed ICache. Not wired to a concrete redis package by default —
 * this package takes no dependency on ioredis/node-redis; inject a real
 * client satisfying RedisClientLike when CACHE_DRIVER=redis. MemoryCache
 * remains the default so Phase 1 runs with zero external infrastructure.
 */
export class RedisCache implements ICache {
  constructor(
    private readonly client: RedisClientLike,
    private readonly keyPrefix = 'agentmarket:',
  ) {}

  private prefixed(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.prefixed(key));
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(this.prefixed(key), JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.prefixed(key));
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
  ): Promise<{ value: T; cacheHit: boolean }> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return { value: cached, cacheHit: true };
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return { value, cacheHit: false };
  }
}
