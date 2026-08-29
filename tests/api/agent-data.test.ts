/**
 * Tests for agent data API endpoints.
 *
 * GET /api/simulations/:id/agents         — paginated agent profiles
 * GET /api/simulations/:id/agents/summary — stance distribution from predictions
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
  agentProfiles,
  predictions,
  scenarios,
  simulations,
} from '../../src/db/schema/tables.js';
import { SCENARIO_SOURCE, SIMULATION_STATUS } from '../../src/config/constants.js';

import type { FastifyInstance } from 'fastify';

// ── Helpers ─────────────────────────────────────────────────────────────

async function createTestScenario(tenantId: string, title = 'Agent Data Scenario') {
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

async function createTestProfile(
  tenantId: string,
  simulationId: string,
  agentId: number,
  username: string,
  stance = 'neutral',
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

async function createTestPrediction(
  tenantId: string,
  simulationId: string,
  type: string,
  confidence: string,
) {
  const [pred] = await db
    .insert(predictions)
    .values({
      tenantId,
      simulationId,
      theater: 'Middle East',
      predictionType: type,
      summary: `${type} prediction`,
      confidence,
      timeHorizon: '30_days',
    })
    .returning({ id: predictions.id });
  return pred;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Agent Data API', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const createdSimulationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Agent Data Tenant');
    otherTenant = await createTestTenant('Agent Data Other Tenant');
  });

  afterEach(async () => {
    for (const id of createdSimulationIds) {
      await db.delete(predictions).where(eq(predictions.simulationId, id));
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

  // ── GET /api/simulations/:id/agents ─────────────────────────────────

  describe('GET /api/simulations/:id/agents', () => {
    it('should return agent profiles for a simulation', async () => {
      const scenario = await createTestScenario(testTenant.id);
      createdScenarioIds.push(scenario.id);

      const sim = await createTestSimulation(testTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      await createTestProfile(testTenant.id, sim.id, 1, 'hawk_agent', 'escalate');
      await createTestProfile(testTenant.id, sim.id, 2, 'dove_agent', 'de_escalate');

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);

      const usernames = body.data.map((p: { username: string }) => p.username);
      expect(usernames).toContain('hawk_agent');
      expect(usernames).toContain('dove_agent');
    });

    it('should return empty array when no profiles exist', async () => {
      const scenario = await createTestScenario(testTenant.id);
      createdScenarioIds.push(scenario.id);

      const sim = await createTestSimulation(testTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('should paginate profiles with a cursor', async () => {
      const scenario = await createTestScenario(testTenant.id);
      createdScenarioIds.push(scenario.id);

      const sim = await createTestSimulation(testTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      for (let i = 0; i < 5; i++) {
        await createTestProfile(testTenant.id, sim.id, i, `agent_${i}`);
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents?limit=2`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(5);
      expect(body.nextCursor).toEqual(expect.any(String));

      const nextResponse = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents?limit=2&cursor=${body.nextCursor}`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(nextResponse.statusCode).toBe(200);
      const nextBody = nextResponse.json();
      expect(nextBody.data).toHaveLength(2);
      expect(nextBody.data.map((profile: { id: string }) => profile.id))
        .not.toEqual(expect.arrayContaining(body.data.map((profile: { id: string }) => profile.id)));
    });

    it('should reject offset pagination so list reads stay cursor-based', async () => {
      const scenario = await createTestScenario(testTenant.id);
      createdScenarioIds.push(scenario.id);
      const sim = await createTestSimulation(testTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents?offset=1`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent simulation', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${fakeId}/agents`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for wrong tenant simulation', async () => {
      const scenario = await createTestScenario(otherTenant.id);
      createdScenarioIds.push(scenario.id);

      const sim = await createTestSimulation(otherTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── GET /api/simulations/:id/agents/summary ─────────────────────────

  describe('GET /api/simulations/:id/agents/summary', () => {
    it('should return stance distribution from stored agent profiles', async () => {
      const scenario = await createTestScenario(testTenant.id);
      createdScenarioIds.push(scenario.id);

      const sim = await createTestSimulation(testTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      await createTestProfile(testTenant.id, sim.id, 1, 'hawk-1', 'escalate');
      await createTestProfile(testTenant.id, sim.id, 2, 'hawk-2', 'aggressive');
      await createTestProfile(testTenant.id, sim.id, 3, 'dove-1', 'de_escalate');
      await createTestProfile(testTenant.id, sim.id, 4, 'neutral-1', 'neutral');

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents/summary`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total).toBeGreaterThan(0);
      expect(body.stances).toBeDefined();
      expect(typeof body.stances.escalate).toBe('number');
      expect(typeof body.stances.de_escalate).toBe('number');
      expect(typeof body.stances.uncertain).toBe('number');
      expect(typeof body.stances.neutral).toBe('number');

      expect(body.total).toBe(4);
      expect(body.stances).toEqual({
        escalate: 50,
        de_escalate: 25,
        uncertain: 0,
        neutral: 25,
      });

      // Sum of stances should be exactly 100
      const sum = body.stances.escalate
        + body.stances.de_escalate
        + body.stances.uncertain
        + body.stances.neutral;
      expect(sum).toBeCloseTo(100, 0);
    });

    it('should return zeros when no predictions exist', async () => {
      const scenario = await createTestScenario(testTenant.id);
      createdScenarioIds.push(scenario.id);

      const sim = await createTestSimulation(testTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents/summary`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total).toBe(0);
      expect(body.stances).toEqual({
        escalate: 0,
        de_escalate: 0,
        uncertain: 0,
        neutral: 0,
      });
    });

    it('should return 404 for non-existent simulation', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${fakeId}/agents/summary`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for wrong tenant simulation', async () => {
      const scenario = await createTestScenario(otherTenant.id);
      createdScenarioIds.push(scenario.id);

      const sim = await createTestSimulation(otherTenant.id, scenario.id);
      createdSimulationIds.push(sim.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${sim.id}/agents/summary`,
        headers: { 'x-api-key': testTenant.apiKey },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 401 when no API key is provided', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await app.inject({
        method: 'GET',
        url: `/api/simulations/${fakeId}/agents/summary`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
