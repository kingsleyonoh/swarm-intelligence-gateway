/**
 * Tests for the quick-launch API endpoints.
 *
 * POST /api/simulations/launch — create scenario + trigger simulation from template
 * GET  /api/scenarios/templates — list available scenario templates
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { createTestApp, createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import { scenarios, simulations } from '../../src/db/schema/tables.js';

import type { FastifyInstance } from 'fastify';

// ── GET /api/scenarios/templates ─────────────────────────────────────

describe('GET /api/scenarios/templates', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns template list without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios/templates',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('templates');
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBe(10);
  });

  it('each template has id, label, and category', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios/templates',
    });

    const { templates } = response.json();
    for (const t of templates) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(typeof t.category).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it('includes expected template IDs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios/templates',
    });

    const { templates } = response.json();
    const ids = templates.map((t: { id: string }) => t.id);
    expect(ids).toContain('south-china-sea');
    expect(ids).toContain('taiwan-strait');
    expect(ids).toContain('eastern-europe');
    expect(ids).toContain('red-sea');
    expect(ids).toContain('persian-gulf');
    expect(ids).toContain('korean-peninsula');
    expect(ids).toContain('arctic');
    expect(ids).toContain('sahel');
    expect(ids).toContain('cyber-global');
    expect(ids).toContain('global-economy');
  });

  it('templates have valid categories', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/scenarios/templates',
    });

    const validCategories = ['military', 'market', 'cyber', 'political'];
    const { templates } = response.json();
    for (const t of templates) {
      expect(validCategories).toContain(t.category);
    }
  });
});

// ── POST /api/simulations/launch ────────────────────────────────────

describe('POST /api/simulations/launch', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const createdScenarioIds: string[] = [];
  const createdSimulationIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('QuickLaunch Test Tenant');
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
    await app.close();
  });

  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations/launch',
      payload: { templateId: 'south-china-sea' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects invalid template ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations/launch',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { templateId: 'nonexistent-template' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing templateId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations/launch',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('creates scenario and simulation from valid template', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations/launch',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { templateId: 'south-china-sea' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();

    expect(body).toHaveProperty('scenarioId');
    expect(body).toHaveProperty('simulationId');
    expect(body).toHaveProperty('status', 'pending');
    expect(body).toHaveProperty('template');
    expect(body.template).toHaveProperty('label');
    expect(body.template).toHaveProperty('category', 'military');

    // Track for cleanup
    createdScenarioIds.push(body.scenarioId);
    createdSimulationIds.push(body.simulationId);
  });

  it('scenario is persisted in database with correct fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations/launch',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { templateId: 'taiwan-strait' },
    });

    const body = response.json();
    createdScenarioIds.push(body.scenarioId);
    createdSimulationIds.push(body.simulationId);

    const [scenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, body.scenarioId));

    expect(scenario).toBeDefined();
    expect(scenario.tenantId).toBe(testTenant.id);
    expect(scenario.title).toContain('Taiwan Strait');
    expect(scenario.source).toBe('quick-launch');
    expect(scenario.worldmonitorRunId).toMatch(/^quick-/);
  });

  it('simulation is persisted with pending status', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/simulations/launch',
      headers: { 'x-api-key': testTenant.apiKey },
      payload: { templateId: 'red-sea' },
    });

    const body = response.json();
    createdScenarioIds.push(body.scenarioId);
    createdSimulationIds.push(body.simulationId);

    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, body.simulationId));

    expect(simulation).toBeDefined();
    expect(simulation.status).toBe('pending');
    expect(simulation.tenantId).toBe(testTenant.id);
    expect(simulation.scenarioId).toBe(body.scenarioId);
  });

  it('works with different valid template IDs', async () => {
    const templateIds = ['eastern-europe', 'persian-gulf', 'cyber-global'];

    for (const templateId of templateIds) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/simulations/launch',
        headers: { 'x-api-key': testTenant.apiKey },
        payload: { templateId },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      createdScenarioIds.push(body.scenarioId);
      createdSimulationIds.push(body.simulationId);
    }
  });
});
