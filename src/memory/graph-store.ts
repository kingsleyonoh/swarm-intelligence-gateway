import { and, asc, eq, sql } from 'drizzle-orm';

import { agentEpisodes, graphEdges, graphNodes } from '../db/schema.js';
import { db } from '../shared/db.js';
import { generateEmbedding } from '../shared/embeddings.js';
import { createChildLogger } from '../shared/logger.js';

import {
  rawRowToEpisodeResult,
  rawRowToGraphNode,
  rowToAgentEpisode,
  rowToGraphNode,
} from './row-mappers.js';

import type {
  AgentEpisode,
  EpisodeSearchResult,
  GraphEdge,
  GraphNode,
} from './types.js';

/**
 * Custom PostgreSQL + pgvector graph store for simulation memory.
 * Every read and write carries the tenant ID explicitly.
 *
 * Embeddings are generated via `src/shared/embeddings.ts` (384-dim
 * all-MiniLM-L6-v2) when callers omit them, so the module is usable
 * without forcing the orchestrator to manage embedding lifecycles.
 */

const log = createChildLogger({ module: 'graph-store' });

// ── Nodes ───────────────────────────────────────────────────────────

/**
 * Insert or update a graph node.
 *
 * Uses the composite unique constraint `uq_graph_nodes_sim_entity`
 * on `(simulation_id, entity_id)` as the conflict target. On conflict
 * the node's mutable fields (`name`, `properties`, `embedding`) are
 * refreshed so callers can incrementally enrich a node as they learn
 * more about the entity during a simulation.
 *
 * If `node.embedding` is omitted, one is generated from
 * `"<entityType>: <name>"` to bias similarity toward type+identity.
 */
export async function upsertNode(node: GraphNode): Promise<string> {
  const embedding =
    node.embedding ?? (await generateEmbedding(`${node.entityType}: ${node.name}`));

  const row = {
    tenantId: node.tenantId,
    simulationId: node.simulationId,
    entityId: node.entityId,
    entityType: node.entityType,
    name: node.name,
    properties: node.properties ?? {},
    embedding,
  };

  const [inserted] = await db
    .insert(graphNodes)
    .values(row)
    .onConflictDoUpdate({
      target: [graphNodes.simulationId, graphNodes.entityId],
      set: {
        entityType: row.entityType,
        name: row.name,
        properties: row.properties,
        embedding: row.embedding,
      },
    })
    .returning({ id: graphNodes.id });

  log.debug({ nodeId: inserted.id, entityId: node.entityId }, 'Upserted graph node');
  return inserted.id;
}

// ── Edges ───────────────────────────────────────────────────────────

/**
 * Insert a graph edge.
 *
 * Edges have no unique constraint on source/target/type in the schema
 * (the same relationship may legitimately appear multiple times with
 * different properties), so this is a straightforward insert that
 * returns the new row ID.
 */
export async function upsertEdge(edge: GraphEdge): Promise<string> {
  const row = {
    tenantId: edge.tenantId,
    simulationId: edge.simulationId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    edgeType: edge.edgeType,
    properties: edge.properties ?? {},
    weight: edge.weight !== undefined ? String(edge.weight) : '1.0',
  };

  const [inserted] = await db
    .insert(graphEdges)
    .values(row)
    .onConflictDoUpdate({
      target: [
        graphEdges.simulationId,
        graphEdges.sourceNodeId,
        graphEdges.targetNodeId,
        graphEdges.edgeType,
      ],
      set: { properties: row.properties, weight: row.weight },
    })
    .returning({ id: graphEdges.id });

  log.debug({ edgeId: inserted.id, edgeType: edge.edgeType }, 'Inserted graph edge');
  return inserted.id;
}

// ── Episodes ────────────────────────────────────────────────────────

/**
 * Append an agent episode.
 *
 * Episodes are append-only — there is no upsert semantic. The
 * embedding is generated from `episode.content` if not provided,
 * so the caller does not need to know about the embedding pipeline.
 */
export async function addEpisode(episode: AgentEpisode): Promise<string> {
  const embedding = episode.embedding ?? (await generateEmbedding(episode.content));

  const row = {
    tenantId: episode.tenantId,
    simulationId: episode.simulationId,
    agentId: episode.agentId,
    roundNumber: episode.roundNumber,
    actionType: episode.actionType,
    content: episode.content,
    embedding,
    sourceKey: episode.sourceKey,
    metadata: episode.metadata ?? {},
  };

  const insert = db.insert(agentEpisodes).values(row);
  const [inserted] = episode.sourceKey
    ? await insert
      .onConflictDoNothing({ target: [agentEpisodes.simulationId, agentEpisodes.sourceKey] })
      .returning({ id: agentEpisodes.id })
    : await insert.returning({ id: agentEpisodes.id });

  if (!inserted && episode.sourceKey) {
    const [existing] = await db
      .select({ id: agentEpisodes.id })
      .from(agentEpisodes)
      .where(and(
        eq(agentEpisodes.tenantId, episode.tenantId),
        eq(agentEpisodes.simulationId, episode.simulationId),
        eq(agentEpisodes.sourceKey, episode.sourceKey),
      ));
    if (existing) return existing.id;
    throw new Error(`Episode insert returned no row for source key ${episode.sourceKey}`);
  }

  log.debug(
    { episodeId: inserted.id, agentId: episode.agentId, round: episode.roundNumber },
    'Inserted agent episode',
  );
  return inserted.id;
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Return all nodes of a given entity type within a simulation.
 * Backed by the `idx_graph_nodes_type` index.
 */
export async function getNodesByType(
  tenantId: string,
  simulationId: string,
  entityType: string,
): Promise<GraphNode[]> {
  const rows = await db
    .select()
    .from(graphNodes)
    .where(
      and(
        eq(graphNodes.tenantId, tenantId),
        eq(graphNodes.simulationId, simulationId),
        eq(graphNodes.entityType, entityType),
      ),
    );

  return rows.map(rowToGraphNode);
}

/**
 * BFS traversal — return all nodes reachable from `nodeId` within
 * `depth` hops (default 1). Implemented as a recursive CTE over
 * `graph_edges` for single-round-trip efficiency.
 *
 * Edges are treated as undirected for neighbor discovery (either
 * direction counts as an adjacency) because swarm influence flows
 * both ways along relationship edges.
 */
export async function getNeighbors(tenantId: string, nodeId: string, depth = 1): Promise<GraphNode[]> {
  const safeDepth = Math.max(1, Math.min(20, Math.floor(depth)));
  const result = await db.execute(sql`
    WITH RECURSIVE reachable(id, hop) AS (
      SELECT ${nodeId}::uuid, 0
      UNION
      SELECT
        CASE
          WHEN ge.source_node_id = r.id THEN ge.target_node_id
          ELSE ge.source_node_id
        END,
        r.hop + 1
      FROM reachable r
      JOIN graph_edges ge
        ON ge.source_node_id = r.id OR ge.target_node_id = r.id
      WHERE ge.tenant_id = ${tenantId}::uuid
        AND r.hop < ${safeDepth}
    )
    SELECT DISTINCT n.*
    FROM graph_nodes n
    JOIN reachable r ON n.id = r.id
    WHERE n.id != ${nodeId}::uuid
      AND n.tenant_id = ${tenantId}::uuid
  `);

  // `db.execute` returns a RowList of raw objects — map to GraphNode
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as Record<string, unknown>[]).map(rawRowToGraphNode);
}

/**
 * Semantic similarity search over agent episodes using pgvector's
 * cosine distance operator (`<=>`). Returns the top-K most similar
 * episodes, each annotated with a `similarity` score in [0, 1]
 * (computed as `1 - distance`).
 *
 * If `agentId` is `null`, the search spans all agents in the
 * simulation — useful for cross-agent consensus extraction during
 * the report phase.
 */
export async function searchEpisodes(
  tenantId: string,
  simulationId: string,
  agentId: number | null,
  query: string,
  topK = 10,
): Promise<EpisodeSearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const agentFilter =
    agentId !== null ? sql`AND agent_id = ${agentId}` : sql``;
  const safeTopK = Math.max(1, Math.min(100, Math.floor(topK)));

  const result = await db.execute(sql`
    SELECT
      id,
      tenant_id,
      simulation_id,
      agent_id,
      round_number,
      action_type,
      content,
      metadata,
      embedding <=> ${vectorLiteral}::vector AS distance
    FROM agent_episodes
    WHERE tenant_id = ${tenantId}::uuid
      AND simulation_id = ${simulationId}::uuid
      ${agentFilter}
    ORDER BY distance ASC
    LIMIT ${safeTopK}
  `);

  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as Record<string, unknown>[]).map(rawRowToEpisodeResult);
}

/** Return every episode for one tenant's agent, ordered by round. */
export async function getAgentMemory(
  tenantId: string,
  simulationId: string,
  agentId: number,
): Promise<AgentEpisode[]> {
  const rows = await db
    .select()
    .from(agentEpisodes)
    .where(
      and(
        eq(agentEpisodes.tenantId, tenantId),
        eq(agentEpisodes.simulationId, simulationId),
        eq(agentEpisodes.agentId, agentId),
      ),
    )
    .orderBy(asc(agentEpisodes.roundNumber));

  return rows.map(rowToAgentEpisode);
}
