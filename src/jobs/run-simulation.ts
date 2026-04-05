/**
 * BullMQ Worker for running MiroFish simulations.
 *
 * Listens on the `run-simulation` queue and delegates to the
 * orchestrator pipeline. Configured for concurrency 1 to avoid
 * overloading the MiroFish API.
 *
 * Retry config (attempts + backoff) is set when the job is ADDED
 * to the queue (see POST /api/simulations), not on the worker.
 */

import { Worker } from 'bullmq';

import { runSimulation } from '../mirofish/orchestrator.js';
import { parseRedisUrl, QUEUE_NAMES } from '../shared/queue.js';
import { createChildLogger } from '../shared/logger.js';
import { env } from '../config/env.js';

const log = createChildLogger({ module: 'run-simulation-worker' });

/**
 * Create and return a BullMQ Worker for the simulation queue.
 *
 * The worker processes one job at a time (concurrency: 1) and calls
 * `runSimulation()` from the orchestrator module. Errors propagate
 * to BullMQ's built-in retry mechanism.
 */
export function createSimulationWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.RUN_SIMULATION,
    async (job) => {
      const { scenarioId, tenantId, agentCount, roundCount, llmProvider } = job.data;
      log.info({ jobId: job.id, scenarioId, tenantId }, 'Starting simulation job');

      await runSimulation({ scenarioId, tenantId, agentCount, roundCount, llmProvider });

      log.info({ jobId: job.id, scenarioId }, 'Simulation job completed');
    },
    {
      connection: parseRedisUrl(env.REDIS_URL),
      concurrency: 1,
    },
  );

  // Per-job failure handler — BullMQ fires this on every failed attempt,
  // including intermediate retries. When `attemptsMade` equals the configured
  // `attempts` the job is permanently dead-lettered and we escalate to ERROR
  // with `permanentFailure=true` so downstream alerting can pick it up.
  worker.on('failed', (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const attemptsTotal = job?.opts?.attempts ?? 1;
    const permanentFailure = attemptsMade >= attemptsTotal;

    const context = {
      jobId: job?.id,
      queue: QUEUE_NAMES.RUN_SIMULATION,
      scenarioId: job?.data?.scenarioId,
      tenantId: job?.data?.tenantId,
      attemptsMade,
      attemptsTotal,
      permanentFailure,
      error: err.message,
    };

    if (permanentFailure) {
      log.error(
        context,
        'Simulation job permanently failed after all retries (dead letter)',
      );
    } else {
      log.warn(context, 'Simulation job attempt failed — will retry');
    }
  });

  // Worker-level errors (Redis disconnect, processor crashes outside a job
  // context) are surfaced here. Without this handler BullMQ swallows them
  // and we have no visibility into worker health.
  worker.on('error', (err) => {
    log.error({ error: err.message }, 'Simulation worker encountered an error');
  });

  return worker;
}
