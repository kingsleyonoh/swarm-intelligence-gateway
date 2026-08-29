import { and, eq } from 'drizzle-orm';

import { SIMULATION_STATUS } from '../config/constants.js';
import { notificationPublisher } from '../ecosystem/events.js';
import { simulations } from '../db/schema/tables.js';
import { db } from '../shared/db.js';
import { createChildLogger } from '../shared/logger.js';
import type { SimPackage } from '../worldmonitor/types.js';

const log = createChildLogger({ module: 'orchestrator-utils' });

export const GRAPH_TIMEOUT_MS = 600_000;
export const SIMULATION_TIMEOUT_MS = 1_800_000;

export function toSimPackage(row: Record<string, unknown>): SimPackage {
  return {
    runId: (row.worldmonitorRunId as string) ?? '',
    timestamp: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
    title: row.title as string,
    selectedTheaters: row.theaters as SimPackage['selectedTheaters'],
    entities: row.entities as SimPackage['entities'],
    eventSeeds: row.eventSeeds as SimPackage['eventSeeds'],
    constraints: row.constraints as SimPackage['constraints'],
    simulationRequirement: row.simulationRequirement as string,
  };
}

export async function updateSimulationStatus(
  simulationId: string,
  tenantId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db.update(simulations).set({ status, ...extra }).where(and(
    eq(simulations.id, simulationId),
    eq(simulations.tenantId, tenantId),
  ));
}

export async function failSimulation(
  simulationId: string,
  tenantId: string,
  errorMessage: string,
): Promise<void> {
  await updateSimulationStatus(simulationId, tenantId, SIMULATION_STATUS.FAILED, {
    errorMessage,
    completedAt: new Date(),
  });
}

export async function publishSimulationEvent(
  eventType: 'simulation.completed' | 'simulation.failed',
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await notificationPublisher.publish(eventType, tenantId, payload);
  } catch (error) {
    log.error(
      { eventType, tenantId, error: error instanceof Error ? error.message : String(error) },
      'Failed to publish ecosystem event',
    );
  }
}
