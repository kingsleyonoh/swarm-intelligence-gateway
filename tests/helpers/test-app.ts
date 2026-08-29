import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';

import { buildApp } from '../../src/api/server.js';
import { db } from '../../src/shared/db.js';
import { tenants } from '../../src/db/schema/tables.js';

import type { FastifyInstance } from 'fastify';

/**
 * Create a Fastify test app instance with all routes + middleware wired.
 * Calls `app.ready()` to finalize the instance.
 * Call `app.close()` in afterAll to clean up.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = buildApp({ logger: false });
  await app.ready();
  return app;
}

/**
 * Create a test tenant directly in DB and return the plaintext API key.
 * Useful for authenticated test requests.
 */
export async function createTestTenant(name = 'Test Tenant'): Promise<{
  id: string;
  name: string;
  apiKey: string;
  apiKeyHash: string;
}> {
  const apiKey = `sig_${crypto.randomBytes(32).toString('hex')}`;
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const [tenant] = await db
    .insert(tenants)
    .values({ name, apiKeyHash })
    .returning({ id: tenants.id, name: tenants.name });

  return { id: tenant.id, name: tenant.name, apiKey, apiKeyHash };
}

/**
 * Clean up test tenants by API key hash.
 */
export async function cleanupTestTenant(apiKeyHash: string): Promise<void> {
  await db.delete(tenants).where(eq(tenants.apiKeyHash, apiKeyHash));
}

/**
 * Check if database is reachable.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await db.execute('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
