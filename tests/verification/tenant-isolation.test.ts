/**
 * Tenant Isolation Verification (PRD Success Criteria #7).
 *
 * For EVERY tenant-scoped resource, Tenant A must not be able to access
 * Tenant B's data. This test seeds two independent tenants with their own
 * scenarios, simulations, and predictions, then asserts that cross-tenant
 * access returns 404 (not 403 — 404 prevents resource-existence leaks).
 *
 * Uses real Dockerised PostgreSQL so tenant scoping is validated against
 * actual SQL WHERE clauses, not mocks. If Docker is not running, these
 * tests will fail — that is correct behaviour.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '../../src/shared/db.js';
import {
  scenarios,
  simulations,
  predictions,
} from '../../src/db/schema/tables.js';
import {
  SIMULATION_STATUS,
  PREDICTION_TYPE,
  SCENARIO_SOURCE,
} from '../../src/config/constants.js';
import {
  createTestApp,
  createTestTenant,
  cleanupTestTenant,
} from '../helpers/test-app.js';

import type { FastifyInstance } from 'fastify';

// ── Fixtures ────────────────────────────────────────────────────────────

interface TenantFixture {
  id: string;
  apiKey: string;
  apiKeyHash: string;
  scenarioId: string;
  simulationId: string;
  predictionId: string;
}

async function seedTenantData(
  tenantId: string,
  label: string,
): Promise<{ scenarioId: string; simulationId: string; predictionId: string }> {
  const [scenario] = await db
    .insert(scenarios)
    .values({
      tenantId,
      title: `${label} Scenario`,
      theaters: [{ label: `${label} Theater`, region: 'Test', stateKind: 'neutral', rankingScore: 0.5 }],
      entities: [],
      eventSeeds: [],
      constraints: { hard: [], soft: [] },
      simulationRequirement: `${label} test`,
      source: SCENARIO_SOURCE.MANUAL,
    })
    .returning({ id: scenarios.id });

  const [simulation] = await db
    .insert(simulations)
    .values({
      tenantId,
      scenarioId: scenario.id,
      status: SIMULATION_STATUS.COMPLETED,
      agentCount: 4096,
      roundCount: 5,
      llmProvider: 'deepseek',
      report: `${label} report body`,
      completedAt: new Date(),
    })
    .returning({ id: simulations.id });

  const [prediction] = await db
    .insert(predictions)
    .values({
      tenantId,
      simulationId: simulation.id,
      theater: `${label} Theater`,
      predictionType: PREDICTION_TYPE.ESCALATION,
      summary: `${label} prediction summary`,
      confidence: '0.85',
      timeHorizon: '72h',
      supportingFactions: [],
      dissentingFactions: [],
    })
    .returning({ id: predictions.id });

  return {
    scenarioId: scenario.id,
    simulationId: simulation.id,
    predictionId: prediction.id,
  };
}

async function cleanupTenantData(tenantId: string): Promise<void> {
  // FK order: leaves first
  const sims = await db
    .select({ id: simulations.id })
    .from(simulations)
    .where(eq(simulations.tenantId, tenantId));
  const simIds = sims.map((s) => s.id);

  if (simIds.length > 0) {
    await db.delete(predictions).where(inArray(predictions.simulationId, simIds));
    await db.delete(simulations).where(inArray(simulations.id, simIds));
  }
  await db.delete(scenarios).where(eq(scenarios.tenantId, tenantId));
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Tenant Isolation Verification (PRD Success Criteria #7)', () => {
  let app: FastifyInstance;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;

  beforeAll(async () => {
    app = await createTestApp();

    const tenA = await createTestTenant('Isolation Tenant A');
    const dataA = await seedTenantData(tenA.id, 'A');
    tenantA = { ...tenA, ...dataA };

    const tenB = await createTestTenant('Isolation Tenant B');
    const dataB = await seedTenantData(tenB.id, 'B');
    tenantB = { ...tenB, ...dataB };
  });

  afterAll(async () => {
    await cleanupTenantData(tenantA.id);
    await cleanupTenantData(tenantB.id);
    await cleanupTestTenant(tenantA.apiKeyHash);
    await cleanupTestTenant(tenantB.apiKeyHash);
    await app.close();
  });

  // ── Scenarios ─────────────────────────────────────────────────────────

  it('Tenant A list scenarios does NOT include Tenant B scenarios', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = (body.data as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain(tenantA.scenarioId);
    expect(ids).not.toContain(tenantB.scenarioId);
  });

  it('Tenant A GET Tenant B scenario by ID returns 404 (not 403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${tenantB.scenarioId}`,
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── Simulations ───────────────────────────────────────────────────────

  it('Tenant A list simulations does NOT include Tenant B simulations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/simulations',
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = (body.data as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain(tenantA.simulationId);
    expect(ids).not.toContain(tenantB.simulationId);
  });

  it('Tenant A GET Tenant B simulation by ID returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulations/${tenantB.simulationId}`,
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(404);
  });

  it('Tenant A GET Tenant B simulation report returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/simulations/${tenantB.simulationId}/report`,
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(404);
  });

  it('Tenant A cancelling Tenant B simulation returns 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/simulations/${tenantB.simulationId}/cancel`,
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── Predictions ───────────────────────────────────────────────────────

  it('Tenant A list predictions does NOT include Tenant B predictions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions',
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = (body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(tenantA.predictionId);
    expect(ids).not.toContain(tenantB.predictionId);
  });

  it('Tenant A latest predictions does NOT include Tenant B predictions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions/latest?minConfidence=0.5',
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = (body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(tenantA.predictionId);
    expect(ids).not.toContain(tenantB.predictionId);
  });

  // ── Tenant profile ────────────────────────────────────────────────────

  it('Tenant A GET /me returns Tenant A profile only', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
      headers: { 'x-api-key': tenantA.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(tenantA.id);
    expect(body.id).not.toBe(tenantB.id);
  });

  // ── Auth boundary ─────────────────────────────────────────────────────

  it('request with no API key returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
    });
    expect(res.statusCode).toBe(401);
  });

  it('request with invalid API key returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
      headers: { 'x-api-key': 'sig_invalid-key-does-not-exist' },
    });
    expect(res.statusCode).toBe(401);
  });
});
