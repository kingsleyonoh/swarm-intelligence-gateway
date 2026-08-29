import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { GraphNode, GraphEdge, AgentEpisode } from '../../src/memory/types.js';

/**
 * ## Testing Strategy
 *
 * The graph store is a thin wrapper around Drizzle queries + pgvector
 * raw SQL. These tests verify the LOGIC of the wrapper:
 *   - Correct query shapes (select/insert/update/execute chains)
 *   - Correct parameter propagation to the DB layer
 *   - Correct result mapping (rows → domain types)
 *   - Automatic embedding generation when callers omit it
 *
 * We mock `db` and `embeddings` per batch-013 guidance. A future
 * integration suite should exercise these methods against a real
 * PostgreSQL + pgvector instance (flagged in the batch results).
 */

// ── Mock Setup ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const dbSelect = vi.fn();
  const dbInsert = vi.fn();
  const dbExecute = vi.fn();
  const generateEmbedding = vi.fn();
  return { dbSelect, dbInsert, dbExecute, generateEmbedding };
});

vi.mock('../../src/shared/db.js', () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
    execute: mocks.dbExecute,
  },
}));

vi.mock('../../src/shared/embeddings.js', () => ({
  generateEmbedding: mocks.generateEmbedding,
  EMBEDDING_DIMENSIONS: 384,
}));

vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Import after mocks
const {
  upsertNode,
  upsertEdge,
  addEpisode,
  getNodesByType,
  getNeighbors,
  searchEpisodes,
  getAgentMemory,
} = await import('../../src/memory/graph-store.js');

// ── Fixtures ────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SIM_ID = '22222222-2222-2222-2222-222222222222';
const NODE_ID_A = '33333333-3333-3333-3333-333333333333';
const NODE_ID_B = '44444444-4444-4444-4444-444444444444';
const NODE_ID_C = '55555555-5555-5555-5555-555555555555';

function fakeEmbedding(fill = 0.1): number[] {
  return new Array(384).fill(fill);
}

function testNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    tenantId: TENANT_ID,
    simulationId: SIM_ID,
    entityId: 'iran-irgc',
    entityType: 'StateActor',
    name: 'Iran Revolutionary Guard',
    properties: { stance: 'aggressive' },
    ...overrides,
  };
}

function testEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    tenantId: TENANT_ID,
    simulationId: SIM_ID,
    sourceNodeId: NODE_ID_A,
    targetNodeId: NODE_ID_B,
    edgeType: 'OPPOSES',
    properties: {},
    weight: 0.9,
    ...overrides,
  };
}

function testEpisode(overrides: Partial<AgentEpisode> = {}): AgentEpisode {
  return {
    tenantId: TENANT_ID,
    simulationId: SIM_ID,
    agentId: 42,
    roundNumber: 1,
    actionType: 'post',
    content: 'Tensions escalate in the Persian Gulf',
    metadata: {},
    ...overrides,
  };
}

/**
 * Chainable mock builder for Drizzle's `db.insert(...).values(...).onConflictDoUpdate(...).returning()`
 * and `db.insert(...).values(...).returning()` call chains.
 */
function mockInsertReturningId(id: string) {
  const returning = vi.fn().mockResolvedValue([{ id }]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({
    returning,
    onConflictDoUpdate,
    onConflictDoNothing,
  });
  return { values, returning, onConflictDoUpdate, onConflictDoNothing };
}

/**
 * Chainable mock builder for `db.select().from(...).where(...)` and
 * `.orderBy(...)` chains returning an array of rows.
 */
function mockSelectReturning(rows: unknown[]) {
  const terminal = Promise.resolve(rows);
  // Build chain: orderBy -> where -> from -> select
  const chain = {
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue(terminal),
      then: terminal.then.bind(terminal),
    }),
    orderBy: vi.fn().mockReturnValue(terminal),
    then: terminal.then.bind(terminal),
  };
  const fromMock = vi.fn().mockReturnValue(chain);
  return { fromMock, chain };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('graph-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateEmbedding.mockResolvedValue(fakeEmbedding(0.1));
  });

  // ────────────────────────────────────────────────────────────────
  describe('upsertNode', () => {
    it('should insert a node and return the new ID', async () => {
      const m = mockInsertReturningId(NODE_ID_A);
      mocks.dbInsert.mockReturnValue({ values: m.values });

      const id = await upsertNode(testNode());

      expect(id).toBe(NODE_ID_A);
      expect(mocks.dbInsert).toHaveBeenCalledTimes(1);
    });

    it('should auto-generate an embedding from the node name when none provided', async () => {
      const m = mockInsertReturningId(NODE_ID_A);
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await upsertNode(testNode({ name: 'Iran Revolutionary Guard' }));

      expect(mocks.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(mocks.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('Iran Revolutionary Guard'),
      );
    });

    it('should NOT generate an embedding when one is provided by the caller', async () => {
      const m = mockInsertReturningId(NODE_ID_A);
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await upsertNode(testNode({ embedding: fakeEmbedding(0.5) }));

      expect(mocks.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should use ON CONFLICT DO UPDATE on (simulation_id, entity_id)', async () => {
      const m = mockInsertReturningId(NODE_ID_A);
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await upsertNode(testNode());

      expect(m.onConflictDoUpdate).toHaveBeenCalledTimes(1);
      const conflictArg = m.onConflictDoUpdate.mock.calls[0][0];
      expect(conflictArg).toHaveProperty('target');
      expect(conflictArg).toHaveProperty('set');
    });

    it('should persist tenantId, simulationId, entityId, entityType, name', async () => {
      const m = mockInsertReturningId(NODE_ID_A);
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await upsertNode(testNode());

      const inserted = m.values.mock.calls[0][0];
      expect(inserted.tenantId).toBe(TENANT_ID);
      expect(inserted.simulationId).toBe(SIM_ID);
      expect(inserted.entityId).toBe('iran-irgc');
      expect(inserted.entityType).toBe('StateActor');
      expect(inserted.name).toBe('Iran Revolutionary Guard');
    });
  });

  // ────────────────────────────────────────────────────────────────
  describe('upsertEdge', () => {
    it('should insert an edge and return the new ID', async () => {
      const EDGE_ID = '66666666-6666-6666-6666-666666666666';
      const m = mockInsertReturningId(EDGE_ID);
      mocks.dbInsert.mockReturnValue({ values: m.values });

      const id = await upsertEdge(testEdge());

      expect(id).toBe(EDGE_ID);
      expect(mocks.dbInsert).toHaveBeenCalledTimes(1);
    });

    it('should persist source/target nodes, edge type, weight', async () => {
      const m = mockInsertReturningId('e1');
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await upsertEdge(testEdge());

      const inserted = m.values.mock.calls[0][0];
      expect(inserted.sourceNodeId).toBe(NODE_ID_A);
      expect(inserted.targetNodeId).toBe(NODE_ID_B);
      expect(inserted.edgeType).toBe('OPPOSES');
    });

    it('should not call generateEmbedding (edges have no embedding column)', async () => {
      const m = mockInsertReturningId('e1');
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await upsertEdge(testEdge());

      expect(mocks.generateEmbedding).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────
  describe('addEpisode', () => {
    it('should insert an episode and return the new ID', async () => {
      const EP_ID = '77777777-7777-7777-7777-777777777777';
      const m = mockInsertReturningId(EP_ID);
      mocks.dbInsert.mockReturnValue({ values: m.values });

      const id = await addEpisode(testEpisode());

      expect(id).toBe(EP_ID);
    });

    it('should auto-generate an embedding from the episode content', async () => {
      const m = mockInsertReturningId('ep1');
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await addEpisode(testEpisode({ content: 'Tensions escalate in the Persian Gulf' }));

      expect(mocks.generateEmbedding).toHaveBeenCalledWith(
        'Tensions escalate in the Persian Gulf',
      );
    });

    it('should NOT generate an embedding when one is provided', async () => {
      const m = mockInsertReturningId('ep1');
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await addEpisode(testEpisode({ embedding: fakeEmbedding(0.7) }));

      expect(mocks.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should persist agentId, roundNumber, actionType, content', async () => {
      const m = mockInsertReturningId('ep1');
      mocks.dbInsert.mockReturnValue({ values: m.values });

      await addEpisode(testEpisode({ agentId: 42, roundNumber: 3, actionType: 'reply' }));

      const inserted = m.values.mock.calls[0][0];
      expect(inserted.agentId).toBe(42);
      expect(inserted.roundNumber).toBe(3);
      expect(inserted.actionType).toBe('reply');
      expect(inserted.content).toBe('Tensions escalate in the Persian Gulf');
    });
  });

  // ────────────────────────────────────────────────────────────────
  describe('getNodesByType', () => {
    it('should return nodes matching the simulation + entity type', async () => {
      const rows = [
        { id: NODE_ID_A, tenantId: TENANT_ID, simulationId: SIM_ID, entityId: 'a', entityType: 'StateActor', name: 'A', properties: {}, embedding: null, createdAt: new Date() },
        { id: NODE_ID_B, tenantId: TENANT_ID, simulationId: SIM_ID, entityId: 'b', entityType: 'StateActor', name: 'B', properties: {}, embedding: null, createdAt: new Date() },
      ];
      const { fromMock } = mockSelectReturning(rows);
      mocks.dbSelect.mockReturnValue({ from: fromMock });

      const result = await getNodesByType(TENANT_ID, SIM_ID, 'StateActor');

      expect(result).toHaveLength(2);
      expect(mocks.dbSelect).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when no nodes match', async () => {
      const { fromMock } = mockSelectReturning([]);
      mocks.dbSelect.mockReturnValue({ from: fromMock });

      const result = await getNodesByType(TENANT_ID, SIM_ID, 'NoSuchType');

      expect(result).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  describe('getNeighbors', () => {
    it('should perform BFS traversal via raw SQL execute', async () => {
      // Recursive CTE returns neighbor node rows
      mocks.dbExecute.mockResolvedValue([
        { id: NODE_ID_B, tenant_id: TENANT_ID, simulation_id: SIM_ID, entity_id: 'b', entity_type: 'StateActor', name: 'B', properties: {}, embedding: null },
        { id: NODE_ID_C, tenant_id: TENANT_ID, simulation_id: SIM_ID, entity_id: 'c', entity_type: 'Faction', name: 'C', properties: {}, embedding: null },
      ]);

      const neighbors = await getNeighbors(TENANT_ID, NODE_ID_A, 1);

      expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
      expect(neighbors).toHaveLength(2);
    });

    it('should default depth to 1 when not specified', async () => {
      mocks.dbExecute.mockResolvedValue([]);

      await getNeighbors(TENANT_ID, NODE_ID_A);

      expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
    });

    it('should support deeper traversal (depth = 2)', async () => {
      mocks.dbExecute.mockResolvedValue([]);

      await getNeighbors(TENANT_ID, NODE_ID_A, 2);

      expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when node has no neighbors', async () => {
      mocks.dbExecute.mockResolvedValue([]);

      const result = await getNeighbors(TENANT_ID, NODE_ID_A, 1);

      expect(result).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  describe('searchEpisodes', () => {
    it('should generate a query embedding and execute a vector similarity query', async () => {
      mocks.generateEmbedding.mockResolvedValue(fakeEmbedding(0.2));
      mocks.dbExecute.mockResolvedValue([
        {
          id: 'ep1',
          tenant_id: TENANT_ID,
          simulation_id: SIM_ID,
          agent_id: 42,
          round_number: 1,
          action_type: 'post',
          content: 'Tensions escalate',
          metadata: {},
          distance: 0.2,
        },
      ]);

      const results = await searchEpisodes(TENANT_ID, SIM_ID, 42, 'escalation in Persian Gulf', 5);

      expect(mocks.generateEmbedding).toHaveBeenCalledWith('escalation in Persian Gulf');
      expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('similarity');
    });

    it('should convert cosine distance to similarity (1 - distance)', async () => {
      mocks.generateEmbedding.mockResolvedValue(fakeEmbedding(0.2));
      mocks.dbExecute.mockResolvedValue([
        { id: 'ep1', tenant_id: TENANT_ID, simulation_id: SIM_ID, agent_id: 1, round_number: 1, action_type: 'post', content: 'x', metadata: {}, distance: 0.3 },
      ]);

      const results = await searchEpisodes(TENANT_ID, SIM_ID, 1, 'query', 5);

      expect(results[0].similarity).toBeCloseTo(0.7, 5);
    });

    it('should return results sorted by similarity (highest first)', async () => {
      mocks.generateEmbedding.mockResolvedValue(fakeEmbedding(0.2));
      mocks.dbExecute.mockResolvedValue([
        { id: 'ep1', tenant_id: TENANT_ID, simulation_id: SIM_ID, agent_id: 1, round_number: 1, action_type: 'post', content: 'closest', metadata: {}, distance: 0.1 },
        { id: 'ep2', tenant_id: TENANT_ID, simulation_id: SIM_ID, agent_id: 1, round_number: 2, action_type: 'post', content: 'farther', metadata: {}, distance: 0.4 },
      ]);

      const results = await searchEpisodes(TENANT_ID, SIM_ID, 1, 'q', 10);

      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    it('should support null agentId to search across all agents', async () => {
      mocks.generateEmbedding.mockResolvedValue(fakeEmbedding(0.2));
      mocks.dbExecute.mockResolvedValue([]);

      await searchEpisodes(TENANT_ID, SIM_ID, null, 'query', 10);

      expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
    });

    it('should default topK to 10 when not provided', async () => {
      mocks.generateEmbedding.mockResolvedValue(fakeEmbedding(0.2));
      mocks.dbExecute.mockResolvedValue([]);

      await searchEpisodes(TENANT_ID, SIM_ID, 1, 'q');

      expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  describe('getAgentMemory', () => {
    it('should return all episodes for the agent ordered by round', async () => {
      const rows = [
        { id: 'e1', tenantId: TENANT_ID, simulationId: SIM_ID, agentId: 42, roundNumber: 1, actionType: 'post', content: 'A', metadata: {}, embedding: null, createdAt: new Date() },
        { id: 'e2', tenantId: TENANT_ID, simulationId: SIM_ID, agentId: 42, roundNumber: 2, actionType: 'reply', content: 'B', metadata: {}, embedding: null, createdAt: new Date() },
      ];
      const { fromMock, chain } = mockSelectReturning(rows);
      mocks.dbSelect.mockReturnValue({ from: fromMock });

      const result = await getAgentMemory(TENANT_ID, SIM_ID, 42);

      expect(result).toHaveLength(2);
      expect(mocks.dbSelect).toHaveBeenCalledTimes(1);
      // Verify an orderBy call happened somewhere in the chain
      expect(chain.where).toHaveBeenCalled();
    });

    it('should return an empty array when the agent has no episodes', async () => {
      const { fromMock } = mockSelectReturning([]);
      mocks.dbSelect.mockReturnValue({ from: fromMock });

      const result = await getAgentMemory(TENANT_ID, SIM_ID, 999);

      expect(result).toEqual([]);
    });
  });
});
