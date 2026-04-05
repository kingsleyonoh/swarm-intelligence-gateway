/**
 * WorldMonitor Redis Poller.
 *
 * Connects to WorldMonitor's external Upstash Redis instance,
 * reads the latest simulation package, validates it, checks for
 * duplicate runIds, and ingests new scenarios into the database.
 *
 * On successful ingestion, emits a `scenario.ingested` event to
 * the BullMQ simulation queue for downstream processing.
 */

import { Redis } from 'ioredis';
import { and, eq } from 'drizzle-orm';

import { env } from '../config/env.js';
import { SCENARIO_SOURCE } from '../config/constants.js';
import { db } from '../shared/db.js';
import { createChildLogger } from '../shared/logger.js';
import { simulationQueue } from '../shared/queue.js';
import { scenarios } from '../db/schema.js';

import { parseSimPackage } from './parser.js';

// ── Constants ──────────────────────────────────────────────────────────

const REDIS_KEY = 'forecast:simulation-package:latest';

const log = createChildLogger({ module: 'worldmonitor-poller' });

// ── Types ──────────────────────────────────────────────────────────────

export interface PollResult {
  ingested: boolean;
  scenarioId?: string;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Poll WorldMonitor's Redis for the latest simulation package.
 *
 * Steps:
 * 1. Connect to WorldMonitor Redis (external — separate from app Redis)
 * 2. Read `forecast:simulation-package:latest`
 * 3. Parse and validate the package
 * 4. Check for duplicate runId in the scenarios table
 * 5. Insert new scenario into database
 * 6. Emit `scenario.ingested` event to BullMQ
 *
 * Error handling:
 * - Redis connection failure → log warning, return { ingested: false }
 * - Key missing/empty → log info, return { ingested: false }
 * - Invalid JSON → log warning, return { ingested: false }
 * - Validation failure → log warning, return { ingested: false }
 * - Duplicate runId → log debug, return { ingested: false }
 *
 * @param tenantId - The tenant to associate the ingested scenario with
 */
export async function pollWorldMonitor(tenantId: string): Promise<PollResult> {
  let wmRedis: Redis | undefined;

  try {
    // 1. Connect to WorldMonitor Redis (external service)
    wmRedis = new Redis(env.WORLDMONITOR_REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry on poll — we'll try again next cycle
      lazyConnect: true,
      connectTimeout: 5000,
    });

    await wmRedis.connect();

    // 2. Read the latest simulation package
    const raw = await wmRedis.get(REDIS_KEY);

    if (!raw) {
      log.info('WorldMonitor Redis key missing or empty, skipping poll cycle');
      return { ingested: false };
    }

    // 3. Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log.warn({ key: REDIS_KEY }, 'WorldMonitor Redis value is not valid JSON');
      return { ingested: false };
    }

    // 4. Validate package shape
    let pkg;
    try {
      pkg = parseSimPackage(parsed);
    } catch (err) {
      log.warn({ err }, 'WorldMonitor package failed validation');
      return { ingested: false };
    }

    // 5. Check for duplicate runId
    const existing = await db
      .select()
      .from(scenarios)
      .where(
        and(
          eq(scenarios.tenantId, tenantId),
          eq(scenarios.worldmonitorRunId, pkg.runId),
        ),
      );

    if (existing.length > 0) {
      log.debug({ runId: pkg.runId }, 'Duplicate runId, skipping ingestion');
      return { ingested: false };
    }

    // 6. Insert into scenarios table
    const [inserted] = await db
      .insert(scenarios)
      .values({
        tenantId,
        worldmonitorRunId: pkg.runId,
        title: pkg.title,
        theaters: pkg.selectedTheaters,
        entities: pkg.entities,
        eventSeeds: pkg.eventSeeds,
        constraints: pkg.constraints,
        simulationRequirement: pkg.simulationRequirement,
        source: SCENARIO_SOURCE.POLLER,
        rawPackage: pkg,
      })
      .returning({ id: scenarios.id });

    const scenarioId = inserted.id;
    log.info({ scenarioId, runId: pkg.runId }, 'New scenario ingested from WorldMonitor');

    // 7. Emit scenario.ingested event to BullMQ
    await simulationQueue.add('scenario.ingested', {
      scenarioId,
      tenantId,
      runId: pkg.runId,
    });

    log.info({ scenarioId }, 'scenario.ingested event emitted to simulation queue');

    return { ingested: true, scenarioId };
  } catch (err) {
    log.warn(
      { err, tenantId, error: (err as Error).message },
      'WorldMonitor poll failed, will retry next cycle',
    );
    return { ingested: false };
  } finally {
    // Always clean up the WorldMonitor Redis connection
    if (wmRedis) {
      try {
        await wmRedis.quit();
      } catch {
        // Ignore quit errors — connection may already be closed
      }
    }
  }
}
