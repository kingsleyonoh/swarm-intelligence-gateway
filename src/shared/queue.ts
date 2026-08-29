import { Queue, type ConnectionOptions } from 'bullmq';

import { env } from '../config/env.js';

/**
 * Parse a Redis URL into the connection options object that BullMQ expects.
 *
 * BullMQ does not accept a URL string directly — it needs
 * `{ host, port, password }` (a subset of ioredis `RedisOptions`).
 */
export function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  const db = database === '' ? undefined : Number(database);

  if (db !== undefined && (!Number.isInteger(db) || db < 0)) {
    throw new Error(`Invalid Redis database index: ${database}`);
  }

  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/** Canonical queue name constants. Add new queues here as the project grows. */
export const QUEUE_NAMES = {
  RUN_SIMULATION: 'run-simulation',
  POLL_WORLDMONITOR: 'poll-worldmonitor',
} as const;

/** Shared BullMQ connection options derived from REDIS_URL. */
const connection = parseRedisUrl(env.REDIS_URL);

/**
 * Create a BullMQ Queue with the shared Redis connection.
 *
 * @param name - Queue name (use `QUEUE_NAMES` constants).
 */
export function createQueue(name: string): Queue {
  return new Queue(name, { connection });
}

/** Pre-built queue for simulation jobs. */
export const simulationQueue = createQueue(QUEUE_NAMES.RUN_SIMULATION);
