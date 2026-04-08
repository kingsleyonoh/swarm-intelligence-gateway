/**
 * Tests for GET /api/simulations/:id/actions.
 *
 * Returns recent agent actions (episodes) for a simulation,
 * joined with agent profiles for username and stance.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  createTestApp,
  createTestTenant,
  cleanupTestTenant,
} from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import {
  agentEpisodes,
  agentProfiles,
  scenarios,
  simulations,
} from '../../src/db/schema/tables.js';
import { SCENARIO_SOURCE, SIMULATION_STATUS } from '../../src/config/constants.js';

import type { FastifyInstance } from 'fastify';

// ── Helpers ─────────────────────────────────────────────────────────────

async function createTestScenario(tenantId: string, title = 'Actions Scenario') {
  const [scenario] = await db
    .insert(scenarios)
    .values({
      tenantId,
      title,
      theaters: [
        { label: 'T', region: 'R', route: 'r', stateKind: 'conflict', rankingScore: 0.8 },
      ],
      entities: [
        { name: 'E', class: 'state_actor', stance: 'neutral', objectives: [], constraints: [], relationships: [] },
      ],
      eventSeeds: [{ type: 't', summary: 's', timing: 'near-term', strength: 0.5 }],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'Test',
      source: SCENARIO_SOURCE.MANUAL,
    })
    .returning({ id: scenarios.id });
  return scenario;
}

async function createTestSimulation(tenantId: string, scenarioId: string) {
  const [simulation] = await db
    .insert(simulations)
    .values({
      tenantId,
      scenarioId,
      status: SIMULATION_STATUS.SIMULATING,
      agentCount: 4096,
      roundCount: 5,
      llmProvider: 'deepseek',
    })
    .returning({ id: simulations.id });
  return simulation;
}

async function createTestProfile(
  tenantId: string,
  simulationId: string,
  agentId: number,
  username: string,
  stance: string,
) {
  const [profile] = await db
    .insert(agentProfiles)
    .values({
      tenantId,
      simulationId,
      agentId,
      username,
      name: username,
      persona: 'test persona',
      entityClass: 'state_actor',
      stance,
    })
    .returning({ id: agentProfiles.id });
  return profile;
}

async function createTestEpisode(
  tenantId: string,
  simulationId: string,
  agentId: number,
  opts: { roundNumber?: number; actionType?: string; content?: string; createdAt?: Date } = {},
) {
  const [episode] = await db
    .insert(agentEpisodes)
    .values({
      tenantId,
      simulationId,
      agentId,
      roundNumber: opts.roundNumber ?? 1,
      actionType: opts.actionType ?? 'CREATE_POST',
      content: opts.content ?? `Test content from agent ${agentId}`,
      metadata: {},
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning({ id: agentEpisodes.id });
  return episode;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('GET /api/simulations/:id/actions', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const createdSimulationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Actions Tenant');
    otherTenant = await createTestTenant('Actions Other Tenant');
  });

  afterEach(async () => {
    for (const id of createdSimulationIds) {
      await db.delete(agentEpisodes).where(eq(agentEpisodes.simulationId, id));
      await db.delete(agentProfiles).where(eq(agentProfiles.simulationId, id));
      await db.delete(simulations).where(eq(simulations.id, id));
    }
    createdSimulationIds.length = 0;

    for (const id of createdScenarioIds) {
      await db.delete(scenarios).where(eq(scenarios.id, id));
    }
    createdScenarioIds.length = 0;
  });

  afterAll(async () => {
    await cleanupTestTenant(testTenant.apiKeyHash);
    await cleanupTestTenant(otherTenant.apiKeyHash);
    await app.close();
  });

  it('should return actions for a simulation with profile data', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(testTenant.id, scenario.id);
    createdSimulationIds.push(sim.id);

    await createTestProfile(testTenant.id, sim.id, 1, 'hawk_agent', 'escalate');
    await createTestEpisode(testTenant.id, sim.id, 1, {
      content: 'Tensions are rising',
      actionType: 'CREATE_POST',
      roundNumber: 1,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${sim.id}/actions`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.hasMore).toBe(false);

    const action = body.data[0];
    expect(action.agentId).toBe(1);
    expect(action.username).toBe('hawk_agent');
    expect(action.stance).toBe('escalate');
    expect(action.roundNumber).toBe(1);
    expect(action.actionType).toBe('CREATE_POST');
    expect(action.content).toBe('Tensions are rising');
    expect(action.id).toBeDefined();
    expect(action.createdAt).toBeDefined();
  });

  it('should return empty array when no episodes exist', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(testTenant.id, scenario.id);
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${sim.id}/actions`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(0);
    expect(body.hasMore).toBe(false);
  });

  it('should respect since timestamp filter', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(testTenant.id, scenario.id);
    createdSimulationIds.push(sim.id);

    const oldDate = new Date('2025-01-01T00:00:00Z');
    const recentDate = new Date('2026-04-07T12:00:00Z');

    await createTestEpisode(testTenant.id, sim.id, 1, {
      content: 'Old action',
      createdAt: oldDate,
    });
    await createTestEpisode(testTenant.id, sim.id, 2, {
      content: 'Recent action',
      createdAt: recentDate,
    });

    const since = new Date('2026-01-01T00:00:00Z').toISOString();
    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${sim.id}/actions?since=${since}`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].content).toBe('Recent action');
  });

  it('should respect limit parameter', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(testTenant.id, scenario.id);
    createdSimulationIds.push(sim.id);

    // Create 5 episodes
    for (let i = 0; i < 5; i++) {
      await createTestEpisode(testTenant.id, sim.id, i, {
        content: `Action ${i}`,
        createdAt: new Date(Date.now() - (5 - i) * 1000),
      });
    }

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${sim.id}/actions?limit=3`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(3);
    expect(body.hasMore).toBe(true);
  });

  it('should return 404 for wrong tenant simulation', async () => {
    const otherScenario = await createTestScenario(otherTenant.id);
    createdScenarioIds.push(otherScenario.id);

    const otherSim = await createTestSimulation(otherTenant.id, otherScenario.id);
    createdSimulationIds.push(otherSim.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${otherSim.id}/actions`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should fallback to default username and stance when no profile exists', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(testTenant.id, scenario.id);
    createdSimulationIds.push(sim.id);

    await createTestEpisode(testTenant.id, sim.id, 99, {
      content: 'No profile agent action',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${sim.id}/actions`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].username).toBe('Agent-99');
    expect(body.data[0].stance).toBe('neutral');
  });

  it('should return 400 for invalid UUID format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations/not-a-uuid/actions',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 when no API key is provided', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${fakeId}/actions`,
    });
    expect(response.statusCode).toBe(401);
  });
});
