import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from './memory-cache.js';
import { buildCacheKey } from './cache-key.js';

describe('MemoryCache', () => {
  it('returns undefined for a miss and the value for a hit', async () => {
    const cache = new MemoryCache();
    expect(await cache.get('missing')).toBeUndefined();
    await cache.set('key', { a: 1 }, 60);
    expect(await cache.get('key')).toEqual({ a: 1 });
  });

  it('expires entries after their TTL', async () => {
    vi.useFakeTimers();
    const cache = new MemoryCache();
    await cache.set('key', 'value', 1);
    vi.advanceTimersByTime(1001);
    expect(await cache.get('key')).toBeUndefined();
    vi.useRealTimers();
  });

  it('getOrSet populates on miss and reports cacheHit correctly', async () => {
    const cache = new MemoryCache();
    const loader = vi.fn().mockResolvedValue('computed');

    const first = await cache.getOrSet('k', 60, loader);
    expect(first).toEqual({ value: 'computed', cacheHit: false });

    const second = await cache.getOrSet('k', 60, loader);
    expect(second).toEqual({ value: 'computed', cacheHit: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('del removes an entry', async () => {
    const cache = new MemoryCache();
    await cache.set('key', 'value', 60);
    await cache.del('key');
    expect(await cache.get('key')).toBeUndefined();
  });
});

describe('buildCacheKey', () => {
  it('sorts params so key order never affects the cache key', () => {
    const a = buildCacheKey('analyze', { symbol: 'BTC', timeframe: '24h' });
    const b = buildCacheKey('analyze', { timeframe: '24h', symbol: 'BTC' });
    expect(a).toBe(b);
    expect(a).toBe('analyze?symbol=BTC&timeframe=24h');
  });

  it('omits undefined params and the query string entirely when empty', () => {
    expect(buildCacheKey('trending', { symbol: undefined })).toBe('trending');
  });
});
