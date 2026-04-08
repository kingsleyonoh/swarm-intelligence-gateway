/**
 * Tests for GET /api/simulations/:id/progress.
 *
 * Returns live progress for a simulation including status, elapsed time,
 * phase label, and whether the simulation is still active.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  createTestApp,
  createTestTenant,
  cleanupTestTenant,
} from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import { scenarios, simulations } from '../../src/db/schema/tables.js';
import { SCENARIO_SOURCE, SIMULATION_STATUS } from '../../src/config/constants.js';

import type { FastifyInstance } from 'fastify';

// ── Helpers ─────────────────────────────────────────────────────────────

async function createTestScenario(tenantId: string, title = 'Progress Scenario') {
  const [scenario] = await db
    .insert(scenarios)
    .values({
      tenantId,
      title,
      theaters: [
        {
          label: 'T',
          region: 'R',
          route: 'r',
          stateKind: 'conflict',
          rankingScore: 0.8,
        },
      ],
      entities: [
        {
          name: 'E',
          class: 'state_actor',
          stance: 'neutral',
          objectives: [],
          constraints: [],
          relationships: [],
        },
      ],
      eventSeeds: [{ type: 't', summary: 's', timing: 'near-term', strength: 0.5 }],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'Test',
      source: SCENARIO_SOURCE.MANUAL,
    })
    .returning({ id: scenarios.id });
  return scenario;
}

async function createTestSimulation(
  tenantId: string,
  scenarioId: string,
  status: string,
  opts: { startedAt?: Date; completedAt?: Date } = {},
) {
  const [simulation] = await db
    .insert(simulations)
    .values({
      tenantId,
      scenarioId,
      status,
      agentCount: 4096,
      roundCount: 5,
      llmProvider: 'deepseek',
      startedAt: opts.startedAt ?? null,
      completedAt: opts.completedAt ?? null,
    })
    .returning({ id: simulations.id });
  return simulation;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('GET /api/simulations/:id/progress', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const createdSimulationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Progress Tenant');
    otherTenant = await createTestTenant('Progress Other Tenant');
  });

  afterEach(async () => {
    for (const id of createdSimulationIds) {
      await db.delete(simulations).where(eq(simulations.id, id));
    }
    createdSimulationIds.length = 0;

    for (const id of createdScenarioIds) {
      await db.delete(simulations).where(eq(simulations.scenarioId, id));
      await db.delete(scenarios).where(eq(scenarios.id, id));
    }
    createdScenarioIds.length = 0;
  });

  afterAll(async () => {
    await cleanupTestTenant(testTenant.apiKeyHash);
    await cleanupTestTenant(otherTenant.apiKeyHash);
    await app.close();
  });

  it('should return progress for an active simulation with isActive=true', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Progress Active');
    createdScenarioIds.push(scenario.id);

    const startedAt = new Date(Date.now() - 30_000); // 30 seconds ago
    const sim = await createTestSimulation(
      testTenant.id,
      scenario.id,
      SIMULATION_STATUS.SIMULATING,
      { startedAt },
    );
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${sim.id}/progress`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('simulating');
    expect(body.phase).toBe('Running swarm simulation');
    expect(body.isActive).toBe(true);
    expect(body.agentCount).toBe(4096);
    expect(body.roundCount).toBe(5);
    expect(body.elapsedMs).toBeGreaterThanOrEqual(29_000);
  });

  it('should return progress for a completed simulation with isActive=false', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Progress Completed');
    createdScenarioIds.push(scenario.id);

    const startedAt = new Date(Date.now() - 120_000); // 2 minutes ago
    const completedAt = new Date(Date.now() - 60_000); // 1 minute ago
    const sim = await createTestSimulation(
      testTenant.id,
      scenario.id,
      SIMULATION_STATUS.COMPLETED,
      { startedAt, completedAt },
    );
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${sim.id}/progress`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('completed');
    expect(body.phase).toBe('Analysis complete');
    expect(body.isActive).toBe(false);
    // Elapsed should be close to 60 seconds (completedAt - startedAt)
    expect(body.elapsedMs).toBeGreaterThanOrEqual(58_000);
    expect(body.elapsedMs).toBeLessThanOrEqual(62_000);
  });

  it('should return correct phase label for each status', async () => {
    const phaseTests: Array<{ status: string; expectedPhase: string }> = [
      { status: SIMULATION_STATUS.PENDING, expectedPhase: 'Queued for processing' },
      { status: SIMULATION_STATUS.QUEUED, expectedPhase: 'Waiting for worker' },
      { status: SIMULATION_STATUS.GRAPH_BUILDING, expectedPhase: 'Building knowledge graph' },
      { status: SIMULATION_STATUS.REPORTING, expectedPhase: 'Generating analysis report' },
      { status: SIMULATION_STATUS.FAILED, expectedPhase: 'Simulation failed' },
      { status: SIMULATION_STATUS.CANCELLED, expectedPhase: 'Simulation cancelled' },
    ];

    const scenario = await createTestScenario(testTenant.id, 'Progress Phases');
    createdScenarioIds.push(scenario.id);

    for (const { status, expectedPhase } of phaseTests) {
      const sim = await createTestSimulation(
        testTenant.id,
        scenario.id,
        status,
      );
      createdSimulationIds.push(sim.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/progress`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.phase).toBe(expectedPhase);
    }
  });

  it('should return 404 for non-existent simulation', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${fakeId}/progress`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 for wrong tenant simulation', async () => {
    const otherScenario = await createTestScenario(otherTenant.id, 'Progress Cross-Tenant');
    createdScenarioIds.push(otherScenario.id);

    const otherSim = await createTestSimulation(
      otherTenant.id,
      otherScenario.id,
      SIMULATION_STATUS.SIMULATING,
    );
    createdSimulationIds.push(otherSim.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${otherSim.id}/progress`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should return 401 when no API key is provided', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await app.inject({
      method: 'GET',
      url: `/api/simulations/${fakeId}/progress`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('should return 400 for invalid UUID format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations/not-a-uuid/progress',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
