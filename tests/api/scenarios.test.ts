import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { createTestApp, createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import { scenarios, simulations } from '../../src/db/schema/tables.js';
import { SCENARIO_SOURCE } from '../../src/config/constants.js';
import { env } from '../../src/config/env.js';

import type { FastifyInstance } from 'fastify';

// ── Test Helpers ────────────────────────────────────────────────────

/** Create a test scenario in the DB for a given tenant. */
async function createTestScenario(
  tenantId: string,
  title = 'Test Scenario',
  source: string = SCENARIO_SOURCE.MANUAL,
) {
  const [scenario] = await db
    .insert(scenarios)
    .values({
      tenantId,
      title,
      theaters: [
        {
          label: 'Test Theater',
          region: 'Test',
          route: 'test',
          stateKind: 'conflict',
          rankingScore: 0.8,
        },
      ],
      entities: [
        {
          name: 'TestEntity',
          class: 'state_actor',
          stance: 'neutral',
          objectives: [],
          constraints: [],
          relationships: [],
        },
      ],
      eventSeeds: [
        { type: 'test', summary: 'Test event', timing: 'near-term', strength: 0.5 },
      ],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'Test simulation requirement',
      source,
    })
    .returning({ id: scenarios.id });

  return scenario;
}

/** A minimal valid SimPackage fixture for ingest tests. */
function validSimPackage(runIdSuffix: string = '001'): Record<string, unknown> {
  return {
    runId: `wm-ingest-test-${runIdSuffix}`,
    timestamp: '2026-04-04T12:00:00Z',
    title: 'Ingest Test Scenario',
    selectedTheaters: [
      {
        label: 'Test Theater',
        region: 'Test Region',
        stateKind: 'conflict',
        rankingScore: 0.75,
      },
    ],
    entities: [
      {
        name: 'Test Actor',
        class: 'state_actor',
        stance: 'neutral',
        objectives: ['Maintain stability'],
        constraints: ['Limited resources'],
        relationships: [],
      },
    ],
    eventSeeds: [
      {
        type: 'diplomatic',
        summary: 'Diplomatic tension',
        timing: 'near-term',
        strength: 0.6,
      },
    ],
    constraints: { hard: ['No nuclear escalation'], soft: ['Limit civilian impact'] },
    simulationRequirement: 'Analyze potential diplomatic fallout.',
  };
}

// ── GET /api/scenarios ─────────────────────────────────────────────

describe('GET /api/scenarios', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('List Scenarios Tenant');
    otherTenant = await createTestTenant('Other Scenarios Tenant');
  });

  afterEach(async () => {
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

  it('should return an empty list when no scenarios exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toEqual([]);
    expect(body).toHaveProperty('nextCursor', null);
  });

  it('should return scenarios for the authenticated tenant', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Alpha Scenario');
    createdScenarioIds.push(scenario.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('id', scenario.id);
    expect(body.data[0]).toHaveProperty('title', 'Alpha Scenario');
  });

  it('should enforce tenant isolation (cannot see other tenant scenarios)', async () => {
    const otherScenario = await createTestScenario(otherTenant.id, 'Forbidden Scenario');
    createdScenarioIds.push(otherScenario.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    const ids = body.data.map((s: any) => s.id);
    expect(ids).not.toContain(otherScenario.id);
  });

  it('should support cursor-based pagination', async () => {
    // Create 3 scenarios
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const scenario = await createTestScenario(testTenant.id, `Paginated Scenario ${i}`);
      createdScenarioIds.push(scenario.id);
      ids.push(scenario.id);
    }

    // Fetch first page with limit=2
    const response1 = await app.inject({
      method: 'GET',
      url: '/api/scenarios?limit=2',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response1.statusCode).toBe(200);
    const body1 = response1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.nextCursor).not.toBeNull();

    // Fetch second page using cursor
    const response2 = await app.inject({
      method: 'GET',
      url: `/api/scenarios?limit=2&cursor=${body1.nextCursor}`,
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
      url: '/api/scenarios',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeLessThanOrEqual(20);
  });

  it('should return 401 when no API key is provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 400 for invalid cursor format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios?cursor=not-a-uuid',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/scenarios/:id ─────────────────────────────────────────

describe('GET /api/scenarios/:id', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Detail Scenarios Tenant');
    otherTenant = await createTestTenant('Other Detail Scenarios Tenant');
  });

  afterEach(async () => {
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

  it('should return scenario detail when found', async () => {
    const scenario = await createTestScenario(testTenant.id, 'Detail Test Scenario');
    createdScenarioIds.push(scenario.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${scenario.id}`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('id', scenario.id);
    expect(body).toHaveProperty('title', 'Detail Test Scenario');
    expect(body).toHaveProperty('theaters');
    expect(body).toHaveProperty('entities');
    expect(body).toHaveProperty('eventSeeds');
    expect(body).toHaveProperty('constraints');
    expect(body).toHaveProperty('simulationRequirement');
    expect(body).toHaveProperty('source');
  });

  it('should return 404 when scenario does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const response = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${fakeId}`,
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 when scenario belongs to another tenant', async () => {
    const otherScenario = await createTestScenario(otherTenant.id, 'Forbidden Detail Scenario');
    createdScenarioIds.push(otherScenario.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${otherScenario.id}`,
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
      url: `/api/scenarios/${fakeId}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 400 for invalid UUID format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios/not-a-uuid',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── POST /api/scenarios/ingest ────────────────────────────────────

describe('POST /api/scenarios/ingest', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const originalWebhookSecret = env.WEBHOOK_SECRET;

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Ingest Scenarios Tenant');
  });

  afterEach(async () => {
    // Restore WEBHOOK_SECRET to original value between tests
    (env as any).WEBHOOK_SECRET = originalWebhookSecret;

    for (const id of createdScenarioIds) {
      await db.delete(simulations).where(eq(simulations.scenarioId, id));
      await db.delete(scenarios).where(eq(scenarios.id, id));
    }
    createdScenarioIds.length = 0;
  });

  afterAll(async () => {
    (env as any).WEBHOOK_SECRET = originalWebhookSecret;
    await cleanupTestTenant(testTenant.apiKeyHash);
    await app.close();
  });

  it('should ingest a valid SimPackage and return scenarioId', async () => {
    // Ensure no webhook secret is set for this test
    (env as any).WEBHOOK_SECRET = undefined;

    const pkg = validSimPackage('happy-path');

    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: pkg,
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body).toHaveProperty('scenarioId');
    expect(body.scenarioId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    createdScenarioIds.push(body.scenarioId);

    // Verify DB record exists
    const [row] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, body.scenarioId));

    expect(row).toBeDefined();
    expect(row.tenantId).toBe(testTenant.id);
    expect(row.worldmonitorRunId).toBe('wm-ingest-test-happy-path');
    expect(row.title).toBe('Ingest Test Scenario');
    expect(row.source).toBe(SCENARIO_SOURCE.MANUAL);
  });

  it('should return 400 for invalid SimPackage (missing required field)', async () => {
    (env as any).WEBHOOK_SECRET = undefined;

    const pkg: any = validSimPackage('invalid-1');
    delete pkg.runId;

    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: pkg,
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when body is not a valid object', async () => {
    (env as any).WEBHOOK_SECRET = undefined;

    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { not: 'a-sim-package' },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 409 when duplicate worldmonitor_run_id', async () => {
    (env as any).WEBHOOK_SECRET = undefined;

    const pkg = validSimPackage('duplicate');

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: pkg,
    });

    expect(res1.statusCode).toBe(201);
    const body1 = res1.json();
    createdScenarioIds.push(body1.scenarioId);

    // Second ingest with same runId should fail
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: pkg,
    });

    expect(res2.statusCode).toBe(409);

    const body2 = res2.json();
    expect(body2.error.code).toBe('CONFLICT');
  });

  it('should accept request when webhook secret matches', async () => {
    (env as any).WEBHOOK_SECRET = 'test-secret-xyz';

    const pkg = validSimPackage('webhook-valid');

    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: {
        'x-api-key': testTenant.apiKey,
        'x-webhook-secret': 'test-secret-xyz',
      },
      payload: pkg,
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body).toHaveProperty('scenarioId');
    createdScenarioIds.push(body.scenarioId);
  });

  it('should return 401 when webhook secret is set but header is wrong', async () => {
    (env as any).WEBHOOK_SECRET = 'test-secret-xyz';

    const pkg = validSimPackage('webhook-wrong');

    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: {
        'x-api-key': testTenant.apiKey,
        'x-webhook-secret': 'wrong-secret',
      },
      payload: pkg,
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when webhook secret is set but header is missing', async () => {
    (env as any).WEBHOOK_SECRET = 'test-secret-xyz';

    const pkg = validSimPackage('webhook-missing');

    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: pkg,
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 without API key regardless of webhook secret', async () => {
    (env as any).WEBHOOK_SECRET = undefined;

    const pkg = validSimPackage('no-auth');

    const response = await app.inject({
      method: 'POST',
      url: '/api/scenarios/ingest',
      payload: pkg,
    });

    expect(response.statusCode).toBe(401);
  });
});
