/**
 * Shared Redis cache helper.
 *
 * Thin wrapper over the shared ioredis client that implements the
 * "read-through / write-through" cache pattern used by the prediction API
 * endpoints. Serialization is JSON — the cached value must be JSON-safe.
 *
 * Fail-open by design: if Redis is unreachable or returns an error on
 * either the GET or SET call, the fetcher is still invoked and its result
 * is returned. Cache failures must NEVER take down a request path.
 *
 * See PRD §10b — "Redis for frequently-queried predictions (5-minute TTL)".
 */

import { redis } from './redis.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger({ module: 'cache' });

/** Default TTL for prediction API cache entries (5 minutes). */
export const PREDICTION_CACHE_TTL_SECONDS = 300;

/**
 * Read-through cache helper — returns the cached value or computes & stores.
 *
 * @param key          - Redis key.
 * @param ttlSeconds   - Expiry for the cache entry, in seconds.
 * @param fetcher      - Async function called on cache miss.
 * @returns The cached or freshly-computed value.
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null && cached !== undefined) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    log.warn(
      { key, error: (err as Error).message },
      'Cache read failed — falling back to fetcher',
    );
  }

  const value = await fetcher();

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    log.warn(
      { key, error: (err as Error).message },
      'Cache write failed — non-fatal',
    );
  }

  return value;
}

/**
 * Invalidate all keys matching a glob pattern using SCAN (non-blocking).
 *
 * Uses Redis SCAN with COUNT 100 so this operation does not hold the
 * Redis event loop hostage on large keyspaces. Each scan batch is
 * deleted immediately before moving to the next cursor.
 *
 * @param pattern - Redis glob pattern (e.g. `predictions:*:tenant-123:*`).
 * @returns Number of keys deleted.
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100,
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      deleted += await redis.del(...keys);
    }
  } while (cursor !== '0');

  return deleted;
}
