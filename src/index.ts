/**
 * Swarm Intelligence Gateway — Entry Point
 *
 * Boots the full application:
 *   1. Builds the Fastify HTTP server (routes + middleware)
 *   2. Starts the BullMQ worker for the run-simulation queue
 *   3. Starts the WorldMonitor poller cron (if a default tenant exists)
 *   4. Listens for HTTP requests
 *   5. Registers SIGTERM/SIGINT handlers for graceful shutdown
 *
 * Graceful shutdown (Success Criteria #8 — "System survives restarts"):
 *   - Stops accepting new HTTP requests (app.close)
 *   - Stops the cron scheduler
 *   - Drains the BullMQ worker (waits for in-flight job to finish)
 *   - Closes the BullMQ queue connection
 *   - Closes the Redis client
 *   - Closes the PostgreSQL pool
 *   - Exits with code 0 on success, 1 on failure
 */

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Worker } from 'bullmq';
import type cron from 'node-cron';

import { buildApp } from './api/server.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';
import { db, closeDb } from './shared/db.js';
import { closeRedis } from './shared/redis.js';
import { simulationQueue } from './shared/queue.js';
import { createSimulationWorker } from './jobs/run-simulation.js';
import { startPollerCron } from './jobs/poll-worldmonitor.js';
import { startCleanupCron } from './jobs/cleanup.js';
import { tenants } from './db/schema.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * Resources owned by the main process that must be closed during shutdown.
 *
 * All fields are optional so the shutdown handler can be tested with
 * partial resource sets and so main() can build it incrementally as
 * each subsystem starts up.
 */
export interface ShutdownResources {
  app?: { close: () => Promise<unknown> };
  cronTask?: { stop: () => void };
  cleanupCronTask?: { stop: () => void };
  worker?: { close: () => Promise<unknown> };
  queue?: { close: () => Promise<unknown> };
  closeRedis?: () => Promise<unknown>;
  closeDb?: () => Promise<unknown>;
  /** Overridable for testing. Defaults to `process.exit`. */
  exit?: (code: number) => void;
}

// ── Shutdown Handler ────────────────────────────────────────────────

/**
 * Create a graceful shutdown handler bound to a specific set of resources.
 *
 * The returned function is idempotent — calling it multiple times (e.g.
 * both SIGTERM and SIGINT fire during container shutdown) only runs the
 * cleanup sequence once.
 *
 * Shutdown order (deliberate):
 *   1. Fastify `app.close()` — stop accepting new requests first
 *   2. Cron `task.stop()` — stop scheduling new poll cycles
 *   3. BullMQ `worker.close()` — drain in-flight jobs
 *   4. BullMQ `queue.close()` — release queue connection
 *   5. Redis `closeRedis()` — QUIT the shared ioredis client
 *   6. PostgreSQL `closeDb()` — drain the connection pool
 *
 * On error, exits with code 1 (short-circuit on first failure — remaining
 * resources will be reaped by the OS when the process dies).
 */
export function createShutdownHandler(resources: ShutdownResources) {
  let shuttingDown = false;
  const exit = resources.exit ?? process.exit.bind(process);

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down gracefully...');

    try {
      if (resources.app) {
        await resources.app.close();
        logger.info('Fastify server closed');
      }

      if (resources.cronTask) {
        resources.cronTask.stop();
        logger.info('Poller cron stopped');
      }

      if (resources.cleanupCronTask) {
        resources.cleanupCronTask.stop();
        logger.info('Cleanup cron stopped');
      }

      if (resources.worker) {
        await resources.worker.close();
        logger.info('BullMQ worker closed');
      }

      if (resources.queue) {
        await resources.queue.close();
        logger.info('Queue closed');
      }

      if (resources.closeRedis) {
        await resources.closeRedis();
        logger.info('Redis closed');
      }

      if (resources.closeDb) {
        await resources.closeDb();
        logger.info('Database closed');
      }

      logger.info('Shutdown complete');
      exit(0);
    } catch (err) {
      logger.error(
        { error: (err as Error).message },
        'Error during shutdown',
      );
      exit(1);
    }
  };
}

// ── Main ────────────────────────────────────────────────────────────

/**
 * Boot the application. Exported for potential programmatic use (tests,
 * embedding) but typically invoked once at the bottom of this file.
 */
export async function main(): Promise<void> {
  logger.info('Starting Swarm Intelligence Gateway...');

  // 1. Build Fastify app (routes + middleware already wired in buildApp)
  const app: FastifyInstance = buildApp({ logger: true });

  // 2. Create BullMQ worker
  const worker: Worker = createSimulationWorker();
  logger.info('BullMQ worker started for run-simulation queue');

  // 3. Start WorldMonitor poller cron (needs a default tenant)
  let cronTask: cron.ScheduledTask | undefined;
  try {
    const activeTenants = await db
      .select()
      .from(tenants)
      .where(eq(tenants.isActive, true))
      .limit(1);
    const defaultTenant = activeTenants[0];
    if (defaultTenant) {
      cronTask = startPollerCron(defaultTenant.id);
      logger.info(
        { tenantId: defaultTenant.id, intervalMinutes: env.POLL_INTERVAL_MINUTES },
        'WorldMonitor poller cron started',
      );
    } else {
      logger.warn(
        'No active tenant found — WorldMonitor poller not started. Run `npm run setup` to create one.',
      );
    }
  } catch (err) {
    logger.error(
      { error: (err as Error).message },
      'Failed to start WorldMonitor poller cron',
    );
  }

  // 4. Start cleanup cron (runs daily at 03:00 UTC regardless of tenant)
  const cleanupCronTask = startCleanupCron();
  logger.info(
    { retentionDays: env.DATA_RETENTION_DAYS },
    'Cleanup cron started',
  );

  // 5. Build shutdown handler with all active resources
  const shutdown = createShutdownHandler({
    app,
    cronTask,
    cleanupCronTask,
    worker,
    queue: simulationQueue,
    closeRedis,
    closeDb,
  });

  // 6. Register signal handlers BEFORE starting the listener so we
  //    can't race a SIGTERM that arrives during app.listen().
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal(
      { error: err.message, stack: err.stack },
      'Uncaught exception',
    );
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason: String(reason) }, 'Unhandled rejection');
    void shutdown('unhandledRejection');
  });

  // 7. Start Fastify server
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, 'Server listening');
  } catch (err) {
    logger.error(
      { error: (err as Error).message },
      'Failed to start server',
    );
    process.exit(1);
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────

/**
 * Detect whether this module was executed directly (e.g. `node dist/index.js`
 * or `tsx src/index.ts`) vs. imported by a test file. Only auto-run main()
 * in the direct-execution case so `vitest` can import `createShutdownHandler`
 * without spinning up a real server.
 */
function isDirectExecution(): boolean {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    const entryUrl = new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
    return import.meta.url === entryUrl;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch((err) => {
    logger.fatal(
      { error: (err as Error).message, stack: (err as Error).stack },
      'Fatal error in main()',
    );
    process.exit(1);
  });
}
