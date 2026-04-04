import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createTestApp } from '../helpers/test-app.js';

import type { FastifyInstance } from 'fastify';

/**
 * Tests for health check endpoints.
 *
 * These are public endpoints — no auth required.
 * Requires running PostgreSQL and Redis for full readiness.
 */
describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 with status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('should not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      // No X-API-Key header
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET /health/db', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 with status ok and latency_ms', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/db',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('latency_ms');
    expect(typeof body.latency_ms).toBe('number');
    expect(body.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('should not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/db',
      // No X-API-Key header
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET /health/ready', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 with services object', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('services');
    expect(body.services).toHaveProperty('db');
    expect(body.services).toHaveProperty('redis');
    expect(body.services).toHaveProperty('mirofish');
  });

  it('should report db status as ok or error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    const body = response.json();
    expect(['ok', 'error']).toContain(body.services.db);
  });

  it('should report redis status as ok or error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    const body = response.json();
    expect(['ok', 'error']).toContain(body.services.redis);
  });

  it('should report mirofish status as ok, error, or unconfigured', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    const body = response.json();
    expect(['ok', 'error', 'unconfigured']).toContain(body.services.mirofish);
  });

  it('should return status ok when all services are healthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    const body = response.json();
    // If db and redis are ok, the overall status should be ok or degraded
    // (mirofish may be unconfigured in test env, which is fine)
    if (body.services.db === 'ok' && body.services.redis === 'ok') {
      // mirofish unconfigured is acceptable for "ok" status
      if (body.services.mirofish === 'ok' || body.services.mirofish === 'unconfigured') {
        expect(body.status).toBe('ok');
      }
    }
  });

  it('should return status degraded when any required service is down', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    const body = response.json();
    // If any core service is down, status should be degraded
    if (body.services.db === 'error' || body.services.redis === 'error') {
      expect(body.status).toBe('degraded');
    }
  });

  it('should not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
      // No X-API-Key header
    });

    // Should not be 401
    expect(response.statusCode).not.toBe(401);
  });
});
