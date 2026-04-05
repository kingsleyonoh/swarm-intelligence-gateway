/**
 * Tests for GET /api/predictions — cursor pagination + filters.
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
import { PREDICTION_TYPE } from '../../src/config/constants.js';
import {
  createPredScenario,
  createPredSimulation,
  createPrediction,
} from './predictions-fixtures.js';

import type { FastifyInstance } from 'fastify';

describe('GET /api/predictions', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
  let otherTenant: Awaited<ReturnType<typeof createTestTenant>>;
  const scenarioIds: string[] = [];
  const simulationIds: string[] = [];
  const predictionIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Pred List Tenant');
    otherTenant = await createTestTenant('Pred Other Tenant');
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
    await cleanupTestTenant(otherTenant.apiKeyHash);
    await app.close();
  });

  it('returns an empty list when no predictions exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toEqual([]);
    expect(body).toHaveProperty('nextCursor', null);
  });

  it('returns predictions for the authenticated tenant', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);
    const p = await createPrediction(testTenant.id, sim.id);
    predictionIds.push(p.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('id', p.id);
    expect(body.data[0]).toHaveProperty('theater', 'Persian Gulf');
    expect(body.data[0]).toHaveProperty('predictionType', 'escalation');
  });

  it('filters predictions by theater', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);

    const pGulf = await createPrediction(testTenant.id, sim.id, {
      theater: 'Persian Gulf',
    });
    const pTaiwan = await createPrediction(testTenant.id, sim.id, {
      theater: 'Taiwan Strait',
    });
    predictionIds.push(pGulf.id, pTaiwan.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions?theater=Taiwan%20Strait',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(pTaiwan.id);
    expect(ids).not.toContain(pGulf.id);
  });

  it('filters predictions by minConfidence', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);

    const pHigh = await createPrediction(testTenant.id, sim.id, {
      confidence: '0.90',
      summary: 'high',
    });
    const pLow = await createPrediction(testTenant.id, sim.id, {
      confidence: '0.40',
      summary: 'low',
    });
    predictionIds.push(pHigh.id, pLow.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions?minConfidence=0.7',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(pHigh.id);
    expect(ids).not.toContain(pLow.id);
  });

  it('filters predictions by type', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);

    const pEsc = await createPrediction(testTenant.id, sim.id, {
      predictionType: PREDICTION_TYPE.ESCALATION,
    });
    const pMarket = await createPrediction(testTenant.id, sim.id, {
      predictionType: PREDICTION_TYPE.MARKET_SHIFT,
    });
    predictionIds.push(pEsc.id, pMarket.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions?type=market_shift',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(pMarket.id);
    expect(ids).not.toContain(pEsc.id);
  });

  it('supports cursor-based pagination', async () => {
    const sc = await createPredScenario(testTenant.id);
    scenarioIds.push(sc.id);
    const sim = await createPredSimulation(testTenant.id, sc.id);
    simulationIds.push(sim.id);

    for (let i = 0; i < 3; i++) {
      const p = await createPrediction(testTenant.id, sim.id, {
        summary: `pred-${i}`,
      });
      predictionIds.push(p.id);
    }

    const res1 = await app.inject({
      method: 'GET',
      url: '/api/predictions?limit=2',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.nextCursor).not.toBeNull();

    const res2 = await app.inject({
      method: 'GET',
      url: `/api/predictions?limit=2&cursor=${body1.nextCursor}`,
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.data.length).toBeGreaterThanOrEqual(1);

    const page1Ids = body1.data.map((p: { id: string }) => p.id);
    const page2Ids = body2.data.map((p: { id: string }) => p.id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });

  it('enforces tenant isolation', async () => {
    const ourSc = await createPredScenario(testTenant.id);
    scenarioIds.push(ourSc.id);
    const ourSim = await createPredSimulation(testTenant.id, ourSc.id);
    simulationIds.push(ourSim.id);
    const ours = await createPrediction(testTenant.id, ourSim.id, {
      summary: 'ours',
    });
    predictionIds.push(ours.id);

    const otherSc = await createPredScenario(otherTenant.id, 'Other Sc');
    scenarioIds.push(otherSc.id);
    const otherSim = await createPredSimulation(otherTenant.id, otherSc.id);
    simulationIds.push(otherSim.id);
    const theirs = await createPrediction(otherTenant.id, otherSim.id, {
      summary: 'theirs',
    });
    predictionIds.push(theirs.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(ours.id);
    expect(ids).not.toContain(theirs.id);
  });

  it('returns 401 when no API key is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid minConfidence', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/predictions?minConfidence=2.5',
      headers: { 'x-api-key': testTenant.apiKey },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
