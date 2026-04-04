import { Redis } from 'ioredis';

import { env } from '../config/env.js';

/**
 * Create a new ioredis client.
 *
 * Uses `lazyConnect: true` so the client does not attempt to connect
 * until the first command is issued. This is important for:
 * - Testing (no live Redis needed to import the module)
 * - Creating multiple clients (e.g. WorldMonitor Redis vs app Redis)
 *
 * @param url - Redis connection URL. Defaults to `env.REDIS_URL`.
 */
export function createRedisClient(url?: string): Redis {
  const client = new Redis(url ?? env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    lazyConnect: true,
  });

  return client;
}

/** Default application Redis client shared between BullMQ, poller, and cache. */
export const redis = createRedisClient();

/**
 * Graceful shutdown — send QUIT to the default Redis client.
 *
 * Call from the main process SIGTERM / SIGINT handler.
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}
