/**
 * WorldMonitor Poller Cron Job.
 *
 * Schedules a recurring poll of WorldMonitor's Redis for new
 * simulation packages. Uses node-cron with the interval configured
 * by POLL_INTERVAL_MINUTES (default 60 minutes).
 *
 * Error handling: on failure the error is logged and the cycle is
 * skipped — the next scheduled run will retry automatically.
 */

import cron from 'node-cron';

import { pollWorldMonitor } from '../worldmonitor/poller.js';
import { createChildLogger } from '../shared/logger.js';
import { env } from '../config/env.js';

const log = createChildLogger({ module: 'poll-worldmonitor-cron' });

/**
 * Start a recurring cron job that polls WorldMonitor for new packages.
 *
 * @param defaultTenantId - The tenant ID to associate with ingested scenarios.
 * @returns The cron ScheduledTask (call `.stop()` for graceful shutdown).
 */
export function startPollerCron(defaultTenantId: string): cron.ScheduledTask {
  const cronExpression = pollCronExpression(env.POLL_INTERVAL_MINUTES);

  log.info({ cronExpression, defaultTenantId }, 'Starting WorldMonitor poller cron');

  const task = cron.schedule(cronExpression, async () => {
    log.info('Starting WorldMonitor poll cycle');
    try {
      const result = await pollWorldMonitor(defaultTenantId);
      if (result.ingested) {
        log.info({ scenarioId: result.scenarioId }, 'New scenario ingested from poll');
      } else {
        log.info('No new scenarios from WorldMonitor');
      }
    } catch (err) {
      log.error(
        { error: (err as Error).message },
        'Poll cycle failed — will retry next cycle',
      );
    }
  });

  return task;
}

function pollCronExpression(intervalMinutes: number): string {
  if (intervalMinutes < 60) return `*/${intervalMinutes} * * * *`;
  const intervalHours = Math.max(1, Math.floor(intervalMinutes / 60));
  if (intervalHours === 1) return '0 * * * *';
  if (intervalHours < 24) return `0 */${intervalHours} * * *`;
  return `0 0 */${Math.floor(intervalHours / 24)} * *`;
}
