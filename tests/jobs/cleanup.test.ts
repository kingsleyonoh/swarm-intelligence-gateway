/**
 * Tests for the daily cleanup cron job.
 *
 * `runCleanup` deletes simulations (and cascading related rows) older than
 * DATA_RETENTION_DAYS. These tests use the real database so they also
 * validate the FK delete ordering against the live schema.
 *
 * `startCleanupCron` is tested with node-cron mocked so we can inspect
 * the schedule expression without waiting for 03:00 UTC.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '../../src/shared/db.js';
import {
  scenarios,
  simulations,
  predictions,
  graphNodes,
  graphEdges,
  agentEpisodes,
  agentProfiles,
} from '../../src/db/schema/tables.js';
import { SIMULATION_STATUS, PREDICTION_TYPE } from '../../src/config/constants.js';
import { createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';
import { runCleanup } from '../../src/jobs/cleanup.js';

// ── Helpers ────────────────────────────────────────────────────────────

async function seedScenario(tenantId: string, title: string) {
  const [row] = await db
    .insert(scenarios)
    .values({
      tenantId,
      title,
      theaters: [],
      entities: [],
      eventSeeds: [],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'test',
      source: 'manual',
    })
    .returning({ id: scenarios.id });
  return row.id;
}

async function seedSimulation(
  tenantId: string,
  scenarioId: string,
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(simulations)
    .values({
      tenantId,
      scenarioId,
      status: SIMULATION_STATUS.COMPLETED,
      agentCount: 4096,
      roundCount: 5,
      llmProvider: 'deepseek',
      createdAt,
    })
    .returning({ id: simulations.id });
  return row.id;
}

async function seedPrediction(tenantId: string, simulationId: string) {
  await db.insert(predictions).values({
    tenantId,
    simulationId,
    theater: 'Test Theater',
    predictionType: PREDICTION_TYPE.ESCALATION,
    summary: 'cleanup test prediction',
    confidence: '0.80',
    timeHorizon: '72h',
    supportingFactions: [],
    dissentingFactions: [],
  });
}

async function seedGraphNode(tenantId: string, simulationId: string, entityId: string) {
  const [row] = await db
    .insert(graphNodes)
    .values({
      tenantId,
      simulationId,
      entityId,
      entityType: 'faction',
      name: 'Test Node',
      properties: {},
    })
    .returning({ id: graphNodes.id });
  return row.id;
}

async function seedGraphEdge(
  tenantId: string,
  simulationId: string,
  sourceId: string,
  targetId: string,
) {
  await db.insert(graphEdges).values({
    tenantId,
    simulationId,
    sourceNodeId: sourceId,
    targetNodeId: targetId,
    edgeType: 'ally',
    properties: {},
    weight: '0.75',
  });
}

async function seedAgentProfile(tenantId: string, simulationId: string, agentId: number) {
  await db.insert(agentProfiles).values({
    tenantId,
    simulationId,
    agentId,
    username: `user-${agentId}`,
    name: `Agent ${agentId}`,
    persona: 'test persona',
  });
}

async function seedAgentEpisode(tenantId: string, simulationId: string, agentId: number) {
  await db.insert(agentEpisodes).values({
    tenantId,
    simulationId,
    agentId,
    roundNumber: 1,
    actionType: 'POST',
    content: 'test content',
    metadata: {},
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('runCleanup', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  const scenarioIds: string[] = [];

  beforeEach(async () => {
    tenant = await createTestTenant('Cleanup Test Tenant');
  });

  afterEach(async () => {
    // Clean up any remaining data for this tenant.
    for (const sid of scenarioIds) {
      const sims = await db
        .select({ id: simulations.id })
        .from(simulations)
        .where(eq(simulations.scenarioId, sid));
      for (const sim of sims) {
        await db.delete(predictions).where(eq(predictions.simulationId, sim.id));
        await db.delete(agentEpisodes).where(eq(agentEpisodes.simulationId, sim.id));
        await db.delete(agentProfiles).where(eq(agentProfiles.simulationId, sim.id));
        await db.delete(graphEdges).where(eq(graphEdges.simulationId, sim.id));
        await db.delete(graphNodes).where(eq(graphNodes.simulationId, sim.id));
        await db.delete(simulations).where(eq(simulations.id, sim.id));
      }
      await db.delete(scenarios).where(eq(scenarios.id, sid));
    }
    scenarioIds.length = 0;
    await cleanupTestTenant(tenant.apiKeyHash);
  });

  it('returns 0 when there are no simulations to clean', async () => {
    const result = await runCleanup();
    expect(result.deletedSimulations).toBe(0);
  });

  it('deletes simulations older than DATA_RETENTION_DAYS', async () => {
    const scId = await seedScenario(tenant.id, 'Old Scenario');
    scenarioIds.push(scId);

    // 120 days ago — well beyond the default 90-day retention
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    const oldSimId = await seedSimulation(tenant.id, scId, oldDate);

    const result = await runCleanup();

    expect(result.deletedSimulations).toBeGreaterThanOrEqual(1);
    const [deleted] = await db
      .select({ id: simulations.id })
      .from(simulations)
      .where(eq(simulations.id, oldSimId));
    expect(deleted).toBeUndefined();
  });

  it('leaves recent simulations intact', async () => {
    const scId = await seedScenario(tenant.id, 'Recent Scenario');
    scenarioIds.push(scId);

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recentSimId = await seedSimulation(tenant.id, scId, recentDate);

    await runCleanup();

    const [stillThere] = await db
      .select({ id: simulations.id })
      .from(simulations)
      .where(eq(simulations.id, recentSimId));
    expect(stillThere).toBeDefined();
    expect(stillThere.id).toBe(recentSimId);
  });

  it('cascades deletion to predictions, graph nodes/edges, profiles, and episodes', async () => {
    const scId = await seedScenario(tenant.id, 'Cascade Scenario');
    scenarioIds.push(scId);

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 200);
    const oldSimId = await seedSimulation(tenant.id, scId, oldDate);

    await seedPrediction(tenant.id, oldSimId);
    const srcNode = await seedGraphNode(tenant.id, oldSimId, 'entity-A');
    const dstNode = await seedGraphNode(tenant.id, oldSimId, 'entity-B');
    await seedGraphEdge(tenant.id, oldSimId, srcNode, dstNode);
    await seedAgentProfile(tenant.id, oldSimId, 1);
    await seedAgentEpisode(tenant.id, oldSimId, 1);

    await runCleanup();

    const preds = await db
      .select({ id: predictions.id })
      .from(predictions)
      .where(eq(predictions.simulationId, oldSimId));
    expect(preds).toHaveLength(0);

    const edges = await db
      .select({ id: graphEdges.id })
      .from(graphEdges)
      .where(eq(graphEdges.simulationId, oldSimId));
    expect(edges).toHaveLength(0);

    const nodes = await db
      .select({ id: graphNodes.id })
      .from(graphNodes)
      .where(eq(graphNodes.simulationId, oldSimId));
    expect(nodes).toHaveLength(0);

    const profiles = await db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.simulationId, oldSimId));
    expect(profiles).toHaveLength(0);

    const episodes = await db
      .select({ id: agentEpisodes.id })
      .from(agentEpisodes)
      .where(eq(agentEpisodes.simulationId, oldSimId));
    expect(episodes).toHaveLength(0);

    const sims = await db
      .select({ id: simulations.id })
      .from(simulations)
      .where(eq(simulations.id, oldSimId));
    expect(sims).toHaveLength(0);
  });

  it('leaves the underlying scenario row alone (scenarios are retained)', async () => {
    const scId = await seedScenario(tenant.id, 'Scenario Retention');
    scenarioIds.push(scId);

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    await seedSimulation(tenant.id, scId, oldDate);

    await runCleanup();

    const [stillThere] = await db
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(eq(scenarios.id, scId));
    expect(stillThere).toBeDefined();
    expect(stillThere.id).toBe(scId);
  });
});

// Cron wiring is covered in tests/jobs/cleanup-cron.test.ts (separate file
// so node-cron can be mocked without interfering with the live-DB tests
// above).
