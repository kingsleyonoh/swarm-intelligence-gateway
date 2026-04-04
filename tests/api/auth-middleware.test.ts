import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';

import { createTestApp, createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import { tenants } from '../../src/db/schema/tables.js';

import type { FastifyInstance } from 'fastify';

/**
 * Tests for API key auth middleware.
 *
 * Requires a running PostgreSQL database — the middleware does a real
 * tenant lookup via Drizzle.
 */
describe('Auth middleware', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Auth Test Tenant');
  });

  afterAll(async () => {
    await cleanupTestTenant(testTenant.apiKeyHash);
    await app.close();
  });

  it('should resolve tenant from valid X-API-Key header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.id).toBe(testTenant.id);
    expect(body.name).toBe('Auth Test Tenant');
  });

  it('should return 401 when X-API-Key header is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body).toHaveProperty('error');
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when API key is invalid', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
      headers: { 'x-api-key': 'sig_invalidkeyhere1234567890abcdef' },
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Invalid API key');
  });

  it('should return 403 when tenant is inactive', async () => {
    // Deactivate the tenant
    await db
      .update(tenants)
      .set({ isActive: false })
      .where(eq(tenants.id, testTenant.id));

    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(403);

    const body = response.json();
    expect(body.error.code).toBe('FORBIDDEN');

    // Re-activate the tenant for other tests
    await db
      .update(tenants)
      .set({ isActive: true })
      .where(eq(tenants.id, testTenant.id));
  });

  it('should return 401 when X-API-Key header is empty string', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
      headers: { 'x-api-key': '' },
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
