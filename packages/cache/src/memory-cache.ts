import type { ICache } from './types.js';

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/** Default cache driver — a process-local TTL map. No external infra required. */
export class MemoryCache implements ICache {
  private readonly store = new Map<string, Entry<unknown>>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
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

  /** Test/diagnostic helpers only — not part of ICache. */
  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
