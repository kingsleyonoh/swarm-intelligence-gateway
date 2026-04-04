import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq, and } from 'drizzle-orm';

import { createTestApp, createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import { tenants, scenarios, simulations } from '../../src/db/schema/tables.js';
import { SCENARIO_SOURCE, SIMULATION_STATUS } from '../../src/config/constants.js';

import type { FastifyInstance } from 'fastify';

// ── Test Helpers ────────────────────────────────────────────────────

/** Create a test scenario in the DB for a given tenant. */
async function createTestScenario(tenantId: string, title = 'Test Scenario') {
  const [scenario] = await db
    .insert(scenarios)
    .values({
      tenantId,
      title,
      theaters: [{ label: 'Test Theater', region: 'Test', route: 'test', stateKind: 'conflict', rankingScore: 0.8 }],
      entities: [{ name: 'TestEntity', class: 'state_actor', stance: 'neutral', objectives: [], constraints: [], relationships: [] }],
      eventSeeds: [{ type: 'test', summary: 'Test event', timing: 'near-term', strength: 0.5 }],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'Test simulation requirement',
      source: SCENARIO_SOURCE.MANUAL,
    })
    .returning({ id: scenarios.id });

  return scenario;
}

/** Create a test simulation record in the DB. */
async function createTestSimulation(
  tenantId: string,
  scenarioId: string,
  status = SIMULATION_STATUS.COMPLETED,
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

// ── POST /api/simulations ──────────────────────────────────────────

describe('POST /api/simulations', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const createdSimulationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Simulation Test Tenant');
  });

  afterEach(async () => {
    // Clean up simulations first (FK constraint)
    for (const id of createdSimulationIds) {
      await db.delete(simulations).where(eq(simulations.id, id));
    }
    createdSimulationIds.length = 0;

    // Then scenarios
    for (const id of createdScenarioIds) {
      await db.delete(simulations).where(eq(simulations.scenarioId, id));
      await db.delete(scenarios).where(eq(scenarios.id, id));
    }
    createdScenarioIds.length = 0;
  });

  afterAll(async () => {
    await cleanupTestTenant(testTenant.apiKeyHash);
    await app.close();
  });

  it('should trigger a simulation and return status queued', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { scenarioId: scenario.id },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body).toHaveProperty('simulationId');
    expect(body).toHaveProperty('status', 'pending');
    expect(body.simulationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    createdSimulationIds.push(body.simulationId);
  });

  it('should create a simulation record in the database', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { scenarioId: scenario.id },
    });

    const body = response.json();
    createdSimulationIds.push(body.simulationId);

    // Verify DB record
    const [dbSim] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, body.simulationId));

    expect(dbSim).toBeDefined();
    expect(dbSim.tenantId).toBe(testTenant.id);
    expect(dbSim.scenarioId).toBe(scenario.id);
    expect(dbSim.status).toBe('pending');
  });

  it('should accept optional agentCount and roundCount', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { scenarioId: scenario.id, agentCount: 2048, roundCount: 3 },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    createdSimulationIds.push(body.simulationId);

    const [dbSim] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, body.simulationId));

    expect(dbSim.agentCount).toBe(2048);
    expect(dbSim.roundCount).toBe(3);
  });

  it('should return 404 when scenarioId does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { scenarioId: fakeId },
    });

    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 when scenario belongs to another tenant', async () => {
    // Create another tenant
    const otherTenant = await createTestTenant('Other Tenant');
    const scenario = await createTestScenario(otherTenant.id);
    createdScenarioIds.push(scenario.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { scenarioId: scenario.id },
    });

    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');

    // Clean up other tenant's scenario and tenant
    await db.delete(scenarios).where(eq(scenarios.id, scenario.id));
    await cleanupTestTenant(otherTenant.apiKeyHash);
  });

  it('should return 401 when no API key is provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { scenarioId: '00000000-0000-0000-0000-000000000000' },
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 when scenarioId is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when scenarioId is not a valid UUID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { scenarioId: 'not-a-uuid' },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when agentCount exceeds maximum', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { scenarioId: scenario.id, agentCount: 200000 },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/simulations ───────────────────────────────────────────

describe('GET /api/simulations', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const createdSimulationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('List Sim Tenant');
    otherTenant = await createTestTenant('Other List Tenant');
  });

  afterEach(async () => {
    // Clean up simulations
    for (const id of createdSimulationIds) {
      await db.delete(simulations).where(eq(simulations.id, id));
    }
    createdSimulationIds.length = 0;

    // Clean up scenarios
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

  it('should return an empty list when no simulations exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toEqual([]);
    expect(body).toHaveProperty('nextCursor', null);
  });

  it('should return simulations for the authenticated tenant', async () => {
    const scenario = await createTestScenario(testTenant.id);
    createdScenarioIds.push(scenario.id);

    const sim = await createTestSimulation(testTenant.id, scenario.id);
    createdSimulationIds.push(sim.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('id', sim.id);
    expect(body.data[0]).toHaveProperty('status', 'completed');
  });

  it('should filter simulations by status', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Status Filter Scenario');
    createdScenarioIds.push(scenario.id);

    const completedSim = await createTestSimulation(testTenant.id, scenario.id, SIMULATION_STATUS.COMPLETED);
    createdSimulationIds.push(completedSim.id);

    // Create a second scenario + simulation with different status
    const scenario2 = await createTestScenario(testTenant.id, 'Status Filter Scenario 2');
    createdScenarioIds.push(scenario2.id);

    const pendingSim = await createTestSimulation(testTenant.id, scenario2.id, SIMULATION_STATUS.PENDING);
    createdSimulationIds.push(pendingSim.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations?status=completed',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const sim of body.data) {
      expect(sim.status).toBe('completed');
    }
  });

  it('should enforce tenant isolation (cannot see other tenant simulations)', async () => {
    // Create simulation for other tenant
    const otherScenario = await createTestScenario(otherTenant.id, 'Other Tenant Scenario');
    createdScenarioIds.push(otherScenario.id);

    const otherSim = await createTestSimulation(otherTenant.id, otherScenario.id);
    createdSimulationIds.push(otherSim.id);

    // Query as testTenant — should not see otherTenant's simulation
    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    const ids = body.data.map((s: any) => s.id);
    expect(ids).not.toContain(otherSim.id);
  });

  it('should support cursor-based pagination', async () => {
    // Create 3 scenarios + simulations
    const sims: string[] = [];
    for (let i = 0; i < 3; i++) {
      const scenario = await createTestScenario(testTenant.id, `Paginated Scenario ${i}`);
      createdScenarioIds.push(scenario.id);
      const sim = await createTestSimulation(testTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);
      sims.push(sim.id);
    }

    // Fetch first page with limit=2
    const response1 = await app.inject({
      method: 'GET',
      url: '/api/simulations?limit=2',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response1.statusCode).toBe(200);
    const body1 = response1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.nextCursor).not.toBeNull();

    // Fetch second page using cursor
    const response2 = await app.inject({
      method: 'GET',
      url: `/api/simulations?limit=2&cursor=${body1.nextCursor}`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response2.statusCode).toBe(200);
    const body2 = response2.json();
    expect(body2.data.length).toBeGreaterThanOrEqual(1);

    // Ensure no overlap between pages
    const page1Ids = body1.data.map((s: any) => s.id);
    const page2Ids = body2.data.map((s: any) => s.id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });

  it('should respect default limit of 20', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeLessThanOrEqual(20);
  });

  it('should return 401 when no API key is provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 for invalid cursor format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/simulations?cursor=not-a-uuid',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
