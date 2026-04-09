/**
 * MiroFish Data Storage Helpers.
 *
 * Persists agent action logs and profiles fetched from MiroFish
 * into the gateway's PostgreSQL database. Used by the orchestrator
 * after simulation phases complete.
 */

import { agentEpisodes, agentProfiles, predictions } from '../db/schema/tables.js';
import { db } from '../shared/db.js';
import { invalidatePattern } from '../shared/cache.js';
import { createChildLogger } from '../shared/logger.js';

import type { ParsedPrediction } from './prediction-parser.js';
import type { ActionLogEntry, MirofishAgentProfile } from './types.js';

const log = createChildLogger({ module: 'data-store' });

/**
 * Store MiroFish action logs as agent episodes in the database.
 *
 * Filters out system events (e.g. round_start, simulation_start) that
 * lack an agent_id or action_type. Only real agent actions are persisted.
 */
export async function storeActionLogs(
  simulationId: string,
  tenantId: string,
  actions: ActionLogEntry[],
): Promise<void> {
  const agentActions = actions.filter(
    (a) => a.agent_id != null && a.action_type,
  );

  if (agentActions.length === 0) return;

  const rows = agentActions.map((action) => ({
    tenantId,
    simulationId,
    agentId: action.agent_id,
    roundNumber: action.round ?? 0,
    actionType: action.action_type,
    content: action.content ?? '',
    metadata: action.metadata ?? {},
  }));

  await db.insert(agentEpisodes).values(rows);
}

/**
 * Store MiroFish agent profiles in the database.
 *
 * Profiles are generated during the prepare phase and contain
 * per-agent persona, profession, and demographic information.
 */
export async function storeProfiles(
  simulationId: string,
  tenantId: string,
  profiles: MirofishAgentProfile[],
): Promise<void> {
  const rows = profiles.map((profile) => ({
    tenantId,
    simulationId,
    agentId: profile.user_id,
    username: profile.username,
    name: profile.name,
    bio: profile.bio ?? '',
    persona: profile.persona ?? '',
    entityClass: profile.profession ?? '',
    stance: 'neutral',
    influenceWeight: '0.5',
  }));

  await db.insert(agentProfiles).values(rows);
}

/**
 * Insert parsed predictions into the `predictions` table, scoped to the
 * owning tenant and simulation. The Drizzle schema declares `confidence`
 * as a decimal column, which maps to a string on insert.
 *
 * After a successful insert, the tenant's prediction cache is invalidated
 * so subsequent queries see the new rows. Cache invalidation failures are
 * logged but do NOT break the pipeline (5-minute TTL is the safety net).
 */
export async function insertPredictions(
  simulationId: string,
  tenantId: string,
  parsed: ParsedPrediction[],
): Promise<void> {
  const rows = parsed.map((p) => ({
    tenantId,
    simulationId,
    theater: p.theater,
    predictionType: p.predictionType,
    summary: p.summary,
    confidence: p.confidence.toFixed(4),
    timeHorizon: p.timeHorizon,
    supportingFactions: p.supportingFactions,
    dissentingFactions: p.dissentingFactions,
  }));

  await db.insert(predictions).values(rows);
  log.info({ simulationId, count: rows.length }, 'Persisted predictions');

  try {
    const deleted = await invalidatePattern(`predictions:*:${tenantId}:*`);
    log.debug({ tenantId, deleted }, 'Prediction cache invalidated');
  } catch (err) {
    log.warn(
      { tenantId, error: (err as Error).message },
      'Failed to invalidate prediction cache — will expire naturally',
    );
  }
}
