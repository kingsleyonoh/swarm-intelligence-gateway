/**
 * Row mappers for the custom graph store.
 *
 * Drizzle ORM returns typed rows for queries built via its query
 * builder, but raw SQL queries (recursive CTEs, pgvector similarity
 * queries) return snake_case row objects. These helpers normalize
 * both shapes into the domain types from `./types.ts`.
 *
 * Kept in a separate file so `graph-store.ts` stays under the 300-line
 * modularity limit and the pure mapping logic can be unit-tested in
 * isolation from the DB layer.
 */

import type { agentEpisodes, graphNodes } from '../db/schema.js';

import type { AgentEpisode, EpisodeSearchResult, GraphNode } from './types.js';

/** Drizzle-returned row → domain `GraphNode`. */
export function rowToGraphNode(
  row: typeof graphNodes.$inferSelect,
): GraphNode {
  return {
    id: row.id,
    tenantId: row.tenantId,
    simulationId: row.simulationId,
    entityId: row.entityId,
    entityType: row.entityType,
    name: row.name,
    properties: (row.properties as Record<string, unknown>) ?? {},
    embedding: row.embedding ?? undefined,
  };
}

/** Drizzle-returned row → domain `AgentEpisode`. */
export function rowToAgentEpisode(
  row: typeof agentEpisodes.$inferSelect,
): AgentEpisode {
  return {
    id: row.id,
    tenantId: row.tenantId,
    simulationId: row.simulationId,
    agentId: row.agentId,
    roundNumber: row.roundNumber,
    actionType: row.actionType,
    content: row.content,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    embedding: row.embedding ?? undefined,
  };
}

/** Raw SQL row (snake_case) → domain `GraphNode`. */
export function rawRowToGraphNode(row: Record<string, unknown>): GraphNode {
  return {
    id: row.id as string,
    tenantId: (row.tenant_id ?? row.tenantId) as string,
    simulationId: (row.simulation_id ?? row.simulationId) as string,
    entityId: (row.entity_id ?? row.entityId) as string,
    entityType: (row.entity_type ?? row.entityType) as string,
    name: row.name as string,
    properties: (row.properties as Record<string, unknown>) ?? {},
    embedding: parseEmbedding(row.embedding),
  };
}

/** Raw SQL row (snake_case + distance) → `EpisodeSearchResult`. */
export function rawRowToEpisodeResult(
  row: Record<string, unknown>,
): EpisodeSearchResult {
  const distance = Number(row.distance ?? 1);
  return {
    id: row.id as string,
    tenantId: (row.tenant_id ?? row.tenantId) as string,
    simulationId: (row.simulation_id ?? row.simulationId) as string,
    agentId: Number(row.agent_id ?? row.agentId),
    roundNumber: Number(row.round_number ?? row.roundNumber),
    actionType: (row.action_type ?? row.actionType) as string,
    content: row.content as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    embedding: parseEmbedding(row.embedding),
    // Cosine distance in pgvector is in [0, 2]; for normalized vectors
    // it stays in [0, 1] (the case for all-MiniLM-L6-v2 with
    // `normalize: true`), so `1 - distance` is a safe similarity score.
    similarity: 1 - distance,
  };
}

/** Accept either a number[] (custom vector type) or a string form. */
export function parseEmbedding(value: unknown): number[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value as number[];
  if (typeof value === 'string') {
    return value
      .replace(/[[\]]/g, '')
      .split(',')
      .map(Number);
  }
  return undefined;
}
