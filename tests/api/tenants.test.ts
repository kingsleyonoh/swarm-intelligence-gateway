import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { createTestApp, createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';
import { db } from '../../src/shared/db.js';
import { tenants } from '../../src/db/schema/tables.js';

import type { FastifyInstance } from 'fastify';

/**
 * Tests for tenant registration and profile endpoints.
 *
 * Requires a running PostgreSQL database.
 */
describe('POST /api/tenants/register', () => {
  let app: FastifyInstance;
  const createdApiKeyHashes: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    // Clean up any tenants created during tests
    for (const hash of createdApiKeyHashes) {
      await db.delete(tenants).where(eq(tenants.apiKeyHash, hash));
    }
    createdApiKeyHashes.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should register a new tenant and return id, name, apiKey', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: 'New Organization' },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name', 'New Organization');
    expect(body).toHaveProperty('apiKey');

    // API key should start with sig_ prefix
    expect(body.apiKey).toMatch(/^sig_[a-f0-9]{64}$/);

    // UUID format check for id
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Track for cleanup
    const hash = crypto.createHash('sha256').update(body.apiKey).digest('hex');
    createdApiKeyHashes.push(hash);
  });

  it('should store only the hash of the API key in the database', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: 'Hash Test Org' },
    });

    const body = response.json();
    const hash = crypto.createHash('sha256').update(body.apiKey).digest('hex');
    createdApiKeyHashes.push(hash);

    // Look up tenant by hash
    const [dbTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.apiKeyHash, hash));

    expect(dbTenant).toBeDefined();
    expect(dbTenant.name).toBe('Hash Test Org');
    // The raw apiKey should NOT be stored anywhere in the tenant record
    expect(dbTenant.apiKeyHash).toBe(hash);
    expect(dbTenant.apiKeyHash).not.toBe(body.apiKey);
  });

  it('should return 400 when name is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body).toHaveProperty('error');
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when name is empty string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when name is only whitespace', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: '   ' },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should allow registering multiple tenants with different names', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: 'Org Alpha' },
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: 'Org Beta' },
    });

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);

    const body1 = res1.json();
    const body2 = res2.json();

    // Different IDs
    expect(body1.id).not.toBe(body2.id);
    // Different API keys
    expect(body1.apiKey).not.toBe(body2.apiKey);

    // Track for cleanup
    createdApiKeyHashes.push(
      crypto.createHash('sha256').update(body1.apiKey).digest('hex'),
    );
    createdApiKeyHashes.push(
      crypto.createHash('sha256').update(body2.apiKey).digest('hex'),
    );
  });

  it('should allow registering tenants with the same name (name is not unique)', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: 'Duplicate Name Org' },
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: { name: 'Duplicate Name Org' },
    });

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);

    const body1 = res1.json();
    const body2 = res2.json();

    // Each gets a unique ID and API key
    expect(body1.id).not.toBe(body2.id);
    expect(body1.apiKey).not.toBe(body2.apiKey);

    // Track for cleanup
    createdApiKeyHashes.push(
      crypto.createHash('sha256').update(body1.apiKey).digest('hex'),
    );
    createdApiKeyHashes.push(
      crypto.createHash('sha256').update(body2.apiKey).digest('hex'),
    );
  });

  it('should return 400 when body is not JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tenants/register',
      payload: 'not json',
      headers: { 'content-type': 'text/plain' },
    });

    // Fastify may return 400 or 415 for bad content type
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
  });
});

describe('GET /api/tenants/me', () => {
  let app: FastifyInstance;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeAll(async () => {
    app = await createTestApp();
    testTenant = await createTestTenant('Profile Test Tenant');
  });

  afterAll(async () => {
    await cleanupTestTenant(testTenant.apiKeyHash);
    await app.close();
  });

  it('should return tenant profile when authenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('id', testTenant.id);
    expect(body).toHaveProperty('name', 'Profile Test Tenant');
    expect(body).toHaveProperty('createdAt');

    // createdAt should be a valid date string
    expect(Date.parse(body.createdAt)).not.toBeNaN();
  });

  it('should not include apiKeyHash in profile response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
      headers: { 'x-api-key': testTenant.apiKey },
    });

    const body = response.json();
    expect(body).not.toHaveProperty('apiKeyHash');
    expect(body).not.toHaveProperty('api_key_hash');
  });

  it('should return 401 when not authenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tenants/me',
    });

    expect(response.statusCode).toBe(401);

    const body = response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
