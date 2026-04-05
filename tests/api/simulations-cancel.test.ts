/**
 * Tests for POST /api/simulations/:id/cancel.
 *
 * Kept in its own file so `simulations.test.ts` stays focused on create/
 * list/detail behaviour.
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

async function createTestScenario(tenantId: string, title = 'Cancel Scenario') {
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
    })
    .returning({ id: simulations.id });
  return simulation;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('POST /api/simulations/:id/cancel', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const createdSimulationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Cancel Sim Tenant');
    otherTenant = await createTestTenant('Cancel Other Tenant');
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

  it('should cancel a running simulation and return status cancelled', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Cancel Running');
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(
      testTenant.id,
      scenario.id,
      SIMULATION_STATUS.SIMULATING,
    );
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${sim.id}/cancel`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('status', 'cancelled');

    const [updated] = await db
      .select({ status: simulations.status, completedAt: simulations.completedAt })
      .from(simulations)
      .where(eq(simulations.id, sim.id));
    expect(updated.status).toBe('cancelled');
    expect(updated.completedAt).not.toBeNull();
  });

  it('should cancel a queued simulation', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Cancel Queued');
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(
      testTenant.id,
      scenario.id,
      SIMULATION_STATUS.QUEUED,
    );
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${sim.id}/cancel`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('status', 'cancelled');
  });

  it('should return 409 when simulation is already completed', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Cancel Completed');
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(
      testTenant.id,
      scenario.id,
      SIMULATION_STATUS.COMPLETED,
    );
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${sim.id}/cancel`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error.code).toBe('CONFLICT');
  });

  it('should return 409 when simulation is already cancelled', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Cancel Already');
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(
      testTenant.id,
      scenario.id,
      SIMULATION_STATUS.CANCELLED,
    );
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${sim.id}/cancel`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(409);
  });

  it('should return 409 when simulation has failed', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Cancel Failed');
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(
      testTenant.id,
      scenario.id,
      SIMULATION_STATUS.FAILED,
    );
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${sim.id}/cancel`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(409);
  });

  it('should return 404 when simulation does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${fakeId}/cancel`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 when simulation belongs to another tenant', async () => {
    const otherScenario = await createTestScenario(otherTenant.id, 'Cancel Cross-Tenant');
    createdScenarioIds.push(otherScenario.id);

    const otherSim = await createTestSimulation(
      otherTenant.id,
      otherScenario.id,
      SIMULATION_STATUS.SIMULATING,
    );
    createdSimulationIds.push(otherSim.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${otherSim.id}/cancel`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should return 401 when no API key is provided', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await app.inject({
      method: 'POST',
      url: `/api/simulations/${fakeId}/cancel`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('should return 400 for invalid UUID format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations/not-a-uuid/cancel',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
