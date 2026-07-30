import { MemoryCache } from './memory-cache.js';
import { RedisCache, type RedisClientLike } from './redis-cache.js';
import type { ICache } from './types.js';

export function createCache(driver: 'memory' | 'redis', redisClient?: RedisClientLike): ICache {
  if (driver === 'redis') {
    if (!redisClient) {
      throw new Error('CACHE_DRIVER=redis requires a redisClient to be supplied to createCache()');
    }
    return new RedisCache(redisClient);
  }
  return new MemoryCache();
}
