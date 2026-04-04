import crypto from 'node:crypto';

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { ValidationError, ForbiddenError } from '../../shared/errors.js';
import { tenants } from '../../db/schema/tables.js';
import { env } from '../../config/env.js';
import { authGuard, type RequestTenant } from '../middleware/auth.js';

/** Zod schema for tenant registration request body. */
const registerBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

/**
 * Register tenant-related routes on the Fastify instance.
 *
 * Public:
 *   POST /api/tenants/register — create tenant, return plaintext API key
 *
 * Protected (requires X-API-Key):
 *   GET /api/tenants/me — return current tenant profile
 */
export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  // ── Public: Register ─────────────────────────────────────────────────
  app.post('/api/tenants/register', async (request, reply) => {
    if (!env.SELF_REGISTRATION_ENABLED) {
      throw new ForbiddenError('Self-registration is disabled');
    }

    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? 'Invalid request body',
        parsed.error.issues,
      );
    }

    const { name } = parsed.data;

    // Generate API key: sig_ prefix + 32 random hex bytes
    const apiKey = `sig_${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const [tenant] = await db
      .insert(tenants)
      .values({ name, apiKeyHash })
      .returning({ id: tenants.id, name: tenants.name });

    return reply.status(201).send({
      id: tenant.id,
      name: tenant.name,
      apiKey,
    });
  });

  // ── Protected: Profile ───────────────────────────────────────────────
  app.get(
    '/api/tenants/me',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      return reply.send({
        id: tenant.id,
        name: tenant.name,
        createdAt: tenant.createdAt,
      });
    },
  );
}
