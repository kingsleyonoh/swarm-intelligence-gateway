import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '../../src/shared/db.js';
import { agentEpisodes, graphEdges, graphNodes, scenarios, simulations } from '../../src/db/schema/tables.js';
import {
  addEpisode,
  getAgentMemory,
  getNeighbors,
  getNodesByType,
  searchEpisodes,
  upsertEdge,
  upsertNode,
} from '../../src/memory/graph-store.js';
import { createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';

const embedding = (value: number): number[] => new Array(384).fill(value);

describe('custom graph store against PostgreSQL and pgvector', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  let scenarioId: string;
  let simulationId: string;
  let nodeA: string;
  let nodeB: string;

  beforeAll(async () => {
    tenant = await createTestTenant('Graph Store Integration');
    const [scenario] = await db.insert(scenarios).values({
      tenantId: tenant.id,
      title: 'Graph store integration',
      theaters: [],
      entities: [],
      eventSeeds: [],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'Test graph storage',
      source: 'manual',
    }).returning({ id: scenarios.id });
    scenarioId = scenario.id;
    const [simulation] = await db.insert(simulations).values({
      tenantId: tenant.id,
      scenarioId,
      status: 'completed',
      agentCount: 1,
      roundCount: 1,
      llmProvider: 'test',
    }).returning({ id: simulations.id });
    simulationId = simulation.id;
  });

  afterAll(async () => {
    await db.delete(graphEdges).where(eq(graphEdges.simulationId, simulationId));
    await db.delete(graphNodes).where(eq(graphNodes.simulationId, simulationId));
    await db.delete(agentEpisodes).where(eq(agentEpisodes.simulationId, simulationId));
    await db.delete(simulations).where(eq(simulations.id, simulationId));
    await db.delete(scenarios).where(eq(scenarios.id, scenarioId));
    await cleanupTestTenant(tenant.apiKeyHash);
  });

  it('stores tenant-scoped nodes, edges, and searchable episodes', async () => {
    nodeA = await upsertNode({
      tenantId: tenant.id,
      simulationId,
      entityId: 'actor-a',
      entityType: 'StateActor',
      name: 'Actor A',
      embedding: embedding(0.1),
    });
    nodeB = await upsertNode({
      tenantId: tenant.id,
      simulationId,
      entityId: 'actor-b',
      entityType: 'Faction',
      name: 'Actor B',
      embedding: embedding(0.2),
    });
    await upsertEdge({ tenantId: tenant.id, simulationId, sourceNodeId: nodeA, targetNodeId: nodeB, edgeType: 'OPPOSES' });
    await addEpisode({
      tenantId: tenant.id,
      simulationId,
      agentId: 5,
      roundNumber: 1,
      actionType: 'CREATE_POST',
      content: 'Actor A opposes Actor B in the Gulf',
      embedding: embedding(0.1),
      sourceKey: 'episode-1',
    });

    expect(await getNodesByType(tenant.id, simulationId, 'StateActor')).toHaveLength(1);
    expect((await getNeighbors(tenant.id, nodeA)).map((node) => node.name)).toEqual(['Actor B']);
    expect((await getAgentMemory(tenant.id, simulationId, 5))).toHaveLength(1);
    const results = await searchEpisodes(tenant.id, simulationId, null, 'Actor A opposes Actor B', 5);
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Actor A opposes');
  });

  it('does not return graph data for a different tenant ID', async () => {
    const otherTenant = await createTestTenant('Graph Store Other Tenant');
    try {
      expect(await getNodesByType(otherTenant.id, simulationId, 'StateActor')).toEqual([]);
      expect(await getAgentMemory(otherTenant.id, simulationId, 5)).toEqual([]);
    } finally {
      await cleanupTestTenant(otherTenant.apiKeyHash);
    }
  });
});
