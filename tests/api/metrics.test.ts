import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createTestApp, createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import { scenarios, simulations } from '../../src/db/schema/tables.js';
import { eq } from 'drizzle-orm';

import type { FastifyInstance } from 'fastify';

describe('GET /api/metrics', () => {
  let app: FastifyInstance;
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTestTenant('Metrics Tenant');
    const [scenario] = await db.insert(scenarios).values({
      tenantId: tenant.id,
      worldmonitorRunId: `metrics-${Date.now()}`,
      title: 'Metrics scenario',
      theaters: [],
      entities: [],
      eventSeeds: [],
      constraints: {},
      simulationRequirement: 'Metrics test',
      source: 'test',
    }).returning({ id: scenarios.id });
    await db.insert(simulations).values({
      tenantId: tenant.id,
      scenarioId: scenario.id,
      status: 'failed',
      startedAt: new Date(Date.now() - 1000),
      completedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(simulations).where(eq(simulations.tenantId, tenant.id));
    await db.delete(scenarios).where(eq(scenarios.tenantId, tenant.id));
    await cleanupTestTenant(tenant.apiKeyHash);
    await app.close();
  });

  it('returns tenant metrics and queue depth with stable names', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/metrics',
      headers: { 'x-api-key': tenant.apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual(expect.objectContaining({
      simulation_count: 1,
      scenarios_ingested: 1,
      queue_depth: expect.any(Number),
      avg_duration_ms: expect.any(Number),
      error_rate: 1,
    }));
  });

  it('requires tenant authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(response.statusCode).toBe(401);
  });
});
