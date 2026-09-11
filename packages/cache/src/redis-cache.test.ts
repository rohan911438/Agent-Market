import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RedisCache } from './redis-cache.js';

// Only runs when a real Redis is reachable — `docker compose up -d redis`
// locally, or the `redis` service CI wires up for this job. Otherwise this
// path is untested, same as before, rather than failing every dev's local
// `npm test` for infra they haven't opted into.
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('RedisCache (real Redis)', () => {
  let client: Redis;
  let cache: RedisCache;

  beforeAll(() => {
    client = new Redis(REDIS_URL!);
    cache = new RedisCache(client, 'agentmarket:test:');
  });

  afterEach(async () => {
    const keys = await client.keys('agentmarket:test:*');
    if (keys.length > 0) await client.del(...keys);
  });

  afterAll(async () => {
    await client.quit();
  });

  it('returns undefined for a miss and the value for a hit', async () => {
    expect(await cache.get('missing')).toBeUndefined();
    await cache.set('key', { a: 1 }, 60);
    expect(await cache.get('key')).toEqual({ a: 1 });
  });

  it('expires entries after their TTL', async () => {
    await cache.set('key', 'value', 1);
    expect(await cache.get('key')).toBe('value');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await cache.get('key')).toBeUndefined();
  }, 5000);

  it('getOrSet populates on miss and reports cacheHit correctly', async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      return 'computed';
    };

    const first = await cache.getOrSet('k', 60, loader);
    expect(first).toEqual({ value: 'computed', cacheHit: false });

    const second = await cache.getOrSet('k', 60, loader);
    expect(second).toEqual({ value: 'computed', cacheHit: true });
    expect(calls).toBe(1);
  });

  it('del removes an entry', async () => {
    await cache.set('key', 'value', 60);
    await cache.del('key');
    expect(await cache.get('key')).toBeUndefined();
  });

  it('prefixes keys so it never collides with unrelated data in the same Redis instance', async () => {
    await cache.set('key', 'value', 60);
    expect(await client.get('agentmarket:test:key')).toBe(JSON.stringify('value'));
  });
});
