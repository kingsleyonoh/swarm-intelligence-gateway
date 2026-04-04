import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../config/env.js';

/**
 * postgres.js connection pool.
 *
 * - `max: 10` — reasonable pool size for a single-service deployment
 * - `idle_timeout: 20` — close idle connections after 20 seconds
 * - `connect_timeout: 10` — fail fast if DB is unreachable
 */
const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

/** Drizzle ORM instance backed by the postgres.js pool. */
export const db = drizzle(client);

/**
 * Graceful shutdown — drain the connection pool.
 *
 * Call this from the main process SIGTERM / SIGINT handler
 * to ensure in-flight queries complete before the process exits.
 */
export async function closeDb(): Promise<void> {
  await client.end();
}
