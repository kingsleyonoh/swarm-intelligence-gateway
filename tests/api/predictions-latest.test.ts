/**
 * Tests for GET /api/predictions/latest — latest high-confidence predictions.
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
  scenarios,
  simulations,
  predictions,
} from '../../src/db/schema/tables.js';
import {
  createPredScenario,
  createPredSimulation,
  createPrediction,
} from './predictions-fixtures.js';

import type { FastifyInstance } from 'fastify';

describe('GET /api/predictions/latest', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const scenarioIds: string[] = [];
  const simulationIds: string[] = [];
  const predictionIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Pred Latest Tenant');
  });

  afterEach(async () => {
    for (const id of predictionIds) {
      await db.delete(predictions).where(eq(predictions.id, id));
    }
    predictionIds.length = 0;

    for (const id of simulationIds) {
      await db.delete(predictions).where(eq(predictions.simulationId, id));
      await db.delete(simulations).where(eq(simulations.id, id));
    }
    simulationIds.length = 0;

    for (const id of scenarioIds) {
      await db.delete(simulations).where(eq(simulations.scenarioId, id));
      await db.delete(scenarios).where(eq(scenarios.id, id));
    }
    scenarioIds.length = 0;
  });

  afterAll(async () => {
    await cleanupTestTenant(testTenant.apiKeyHash);
    await app.close();
  });

  it('returns an empty array when no predictions exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions/latest',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toEqual([]);
  });

  it('returns only high-confidence predictions (>= 0.7 by default)', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);

    const pHigh = await createPrediction(testTenant.id, sim.id, {
      confidence: '0.85',
      summary: 'high',
    });
    const pLow = await createPrediction(testTenant.id, sim.id, {
      confidence: '0.50',
      summary: 'low',
    });
    predictionIds.push(pHigh.id, pLow.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions/latest',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(pHigh.id);
    expect(ids).not.toContain(pLow.id);
  });

  it('honours custom minConfidence query param', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);

    const p50 = await createPrediction(testTenant.id, sim.id, {
      confidence: '0.55',
      summary: 'mid',
    });
    const p85 = await createPrediction(testTenant.id, sim.id, {
      confidence: '0.85',
      summary: 'high',
    });
    predictionIds.push(p50.id, p85.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions/latest?minConfidence=0.5',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(p50.id);
    expect(ids).toContain(p85.id);
  });

  it('respects the limit query param', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);

    for (let i = 0; i < 5; i++) {
      const p = await createPrediction(testTenant.id, sim.id, {
        confidence: '0.80',
        summary: `p-${i}`,
      });
      predictionIds.push(p.id);
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions/latest?limit=3',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeLessThanOrEqual(3);
  });

  it('returns 401 when no API key is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions/latest',
    });
    expect(res.statusCode).toBe(401);
  });
});
