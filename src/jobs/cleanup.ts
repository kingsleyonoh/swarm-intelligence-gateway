/**
 * Cleanup Cron Job.
 *
 * Deletes simulations (and their cascading graph, agent, and prediction
 * rows) older than DATA_RETENTION_DAYS. Runs daily at 03:00 UTC. The
 * underlying `scenarios` rows are retained — they are lightweight
 * metadata and may be referenced by ecosystem integrations.
 *
 * FK delete order is explicit because the Drizzle schema does not
 * declare ON DELETE CASCADE: we delete leaf rows (predictions, edges,
 * nodes, profiles, episodes) first, then the simulation rows themselves.
 *
 * See PRD §7 (cleanup-old-data job) and §14 (DATA_RETENTION_DAYS env).
 */

import { inArray, lt } from 'drizzle-orm';
import cron from 'node-cron';

import { env } from '../config/env.js';
import {
  agentEpisodes,
  agentProfiles,
  graphEdges,
  graphNodes,
  predictions,
  simulations,
} from '../db/schema/tables.js';
import { db } from '../shared/db.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger({ module: 'cleanup-cron' });

/** Cron expression: 03:00 UTC daily. */
const CLEANUP_SCHEDULE = '0 3 * * *';

export interface CleanupResult {
  /** Number of simulation rows deleted. */
  deletedSimulations: number;
}

/**
 * Delete simulations (and cascading related rows) older than the retention
 * window configured by `DATA_RETENTION_DAYS`.
 *
 * Safe to call manually for testing or on-demand cleanup.
 */
export async function runCleanup(): Promise<CleanupResult> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - env.DATA_RETENTION_DAYS);

  log.info(
    { cutoffDate: cutoffDate.toISOString(), retentionDays: env.DATA_RETENTION_DAYS },
    'Starting cleanup',
  );

  const oldSims = await db
    .select({ id: simulations.id })
    .from(simulations)
    .where(lt(simulations.createdAt, cutoffDate));

  if (oldSims.length === 0) {
    log.info('No simulations to clean up');
    return { deletedSimulations: 0 };
  }

  const oldSimIds = oldSims.map((s) => s.id);

  // FK order: leaves first, simulation rows last.
  await db.delete(predictions).where(inArray(predictions.simulationId, oldSimIds));
  await db.delete(graphEdges).where(inArray(graphEdges.simulationId, oldSimIds));
  await db.delete(graphNodes).where(inArray(graphNodes.simulationId, oldSimIds));
  await db.delete(agentEpisodes).where(inArray(agentEpisodes.simulationId, oldSimIds));
  await db.delete(agentProfiles).where(inArray(agentProfiles.simulationId, oldSimIds));
  await db.delete(simulations).where(inArray(simulations.id, oldSimIds));

  log.info({ count: oldSimIds.length }, 'Cleanup complete');
  return { deletedSimulations: oldSimIds.length };
}

/**
 * Start the daily cleanup cron job.
 *
 * @returns The cron ScheduledTask (call `.stop()` for graceful shutdown).
 */
export function startCleanupCron(): cron.ScheduledTask {
  log.info({ schedule: CLEANUP_SCHEDULE }, 'Starting cleanup cron');

  const task = cron.schedule(CLEANUP_SCHEDULE, async () => {
    log.info('Cleanup cycle triggered');
    try {
      const result = await runCleanup();
      log.info({ result }, 'Cleanup cycle complete');
    } catch (err) {
      log.error(
        { error: (err as Error).message },
        'Cleanup cycle failed — will retry at next schedule',
      );
    }
  });

  return task;
}
