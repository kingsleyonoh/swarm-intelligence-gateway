/**
 * Scenario API routes.
 *
 * Protected endpoints for listing, retrieving, and manually ingesting
 * WorldMonitor SimPackage scenarios. All routes require X-API-Key auth.
 *
 * GET  /api/scenarios           — list scenarios with cursor pagination
 * GET  /api/scenarios/:id       — get scenario detail
 * POST /api/scenarios/ingest    — manually ingest a SimPackage JSON body
 *
 * The ingest endpoint additionally supports Webhook Engine integration:
 * when WEBHOOK_SECRET env var is set, requests must include a matching
 * X-Webhook-Secret header.
 */

import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors.js';
import { paginationSchema, uuidSchema } from '../../shared/validation.js';
import { scenarios } from '../../db/schema/tables.js';
import { SCENARIO_SOURCE } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { parseSimPackage } from '../../worldmonitor/parser.js';
import { authGuard, requireTenant } from '../middleware/auth.js';

// ── Routes ─────────────────────────────────────────────────────────────

export async function scenarioRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/scenarios ──────────────────────────────────────────────
  app.get(
    '/api/scenarios',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      const parsed = paginationSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Invalid query parameters',
          parsed.error.issues,
        );
      }

      const { cursor, limit } = parsed.data;

      const conditions = [eq(scenarios.tenantId, tenant.id)];

      if (cursor) {
        const [cursorRow] = await db
          .select({ id: scenarios.id, createdAt: scenarios.createdAt })
          .from(scenarios)
          .where(and(eq(scenarios.id, cursor), eq(scenarios.tenantId, tenant.id)));

        if (cursorRow) {
          const cursorCondition = or(
            lt(scenarios.createdAt, cursorRow.createdAt),
            and(
              eq(scenarios.createdAt, cursorRow.createdAt),
              lt(scenarios.id, cursorRow.id),
            ),
          );
          if (cursorCondition) conditions.push(cursorCondition);
        }
      }

      const rows = await db
        .select({
          id: scenarios.id,
          worldmonitorRunId: scenarios.worldmonitorRunId,
          title: scenarios.title,
          source: scenarios.source,
          createdAt: scenarios.createdAt,
        })
        .from(scenarios)
        .where(and(...conditions))
        .orderBy(desc(scenarios.createdAt), desc(scenarios.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].id : null;

      return reply.send({ data, nextCursor });
    },
  );

  // ── POST /api/scenarios/ingest ──────────────────────────────────────
  // Registered BEFORE /:id so Fastify matches the literal path first.
  app.post(
    '/api/scenarios/ingest',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      // Optional Webhook Engine secret verification
      if (env.WEBHOOK_SECRET) {
        const header = request.headers['x-webhook-secret'];
        const provided =
          typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;

        if (!provided || provided !== env.WEBHOOK_SECRET) {
          throw new UnauthorizedError('Invalid or missing webhook secret');
        }
      }

      // Parse + validate the SimPackage body. parseSimPackage throws
      // ValidationError on malformed input, which the global error
      // handler translates into a 400 response.
      const pkg = parseSimPackage(request.body);

      // Check for duplicate worldmonitor_run_id for this tenant
      const [existing] = await db
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(
          and(
            eq(scenarios.tenantId, tenant.id),
            eq(scenarios.worldmonitorRunId, pkg.runId),
          ),
        );

      if (existing) {
        throw new ConflictError(
          `Scenario with worldmonitor run id '${pkg.runId}' already exists`,
        );
      }

      const [inserted] = await db
        .insert(scenarios)
        .values({
          tenantId: tenant.id,
          worldmonitorRunId: pkg.runId,
          title: pkg.title,
          theaters: pkg.selectedTheaters,
          entities: pkg.entities,
          eventSeeds: pkg.eventSeeds,
          constraints: pkg.constraints,
          simulationRequirement: pkg.simulationRequirement,
          source: SCENARIO_SOURCE.MANUAL,
          rawPackage: pkg,
        })
        .returning({ id: scenarios.id });

      return reply.status(201).send({ scenarioId: inserted.id });
    },
  );

  // ── GET /api/scenarios/:id ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/scenarios/:id',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid scenario id');
      }
      const id = idParse.data;

      const [scenario] = await db
        .select({
          id: scenarios.id,
          worldmonitorRunId: scenarios.worldmonitorRunId,
          title: scenarios.title,
          theaters: scenarios.theaters,
          entities: scenarios.entities,
          eventSeeds: scenarios.eventSeeds,
          constraints: scenarios.constraints,
          simulationRequirement: scenarios.simulationRequirement,
          source: scenarios.source,
          createdAt: scenarios.createdAt,
        })
        .from(scenarios)
        .where(
          and(
            eq(scenarios.id, id),
            eq(scenarios.tenantId, tenant.id),
          ),
        );

      if (!scenario) {
        throw new NotFoundError(`Scenario not found: ${id}`);
      }

      return reply.send(scenario);
    },
  );
}
