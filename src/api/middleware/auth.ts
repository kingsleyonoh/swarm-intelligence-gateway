import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { db } from '../../shared/db.js';
import { UnauthorizedError, ForbiddenError } from '../../shared/errors.js';
import { tenants } from '../../db/schema/tables.js';

/** The shape of a resolved tenant attached to the request. */
export interface RequestTenant {
  id: string;
  name: string;
  isActive: boolean;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant: RequestTenant | null;
  }
}

/**
 * Register the `request.tenant` decorator and the `authGuard` hook.
 *
 * Call this once during app setup. Then use `authGuard` as a
 * `preHandler` hook on any protected route or plugin scope.
 */
export function registerAuthDecorator(app: FastifyInstance): void {
  app.decorateRequest('tenant', null);
}

/**
 * Fastify preHandler hook that resolves a tenant from the
 * `X-API-Key` header.
 *
 * 1. Read header → reject if missing or empty
 * 2. SHA-256 hash → lookup in `tenants` table
 * 3. Reject if not found (invalid key) or inactive (deactivated)
 * 4. Attach tenant to `request.tenant`
 */
export async function authGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new UnauthorizedError('Missing X-API-Key header');
  }

  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.apiKeyHash, hash))
    .limit(1);

  if (!tenant) {
    throw new UnauthorizedError('Invalid API key');
  }

  if (!tenant.isActive) {
    throw new ForbiddenError('Tenant is inactive');
  }

  request.tenant = tenant;
}

/** Read the tenant resolved by `authGuard` inside a protected route. */
export function requireTenant(request: FastifyRequest): RequestTenant {
  if (!request.tenant) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.tenant;
}
