/**
 * Simulation API routes.
 *
 * Protected endpoints for triggering and listing simulations.
 * All routes require X-API-Key authentication via authGuard.
 *
 * POST /api/simulations      — trigger a simulation from a scenario
 * GET  /api/simulations      — list simulations with cursor pagination + status filter
 * GET  /api/simulations/:id  — simulation detail
 *
 * Sub-resource routes (`:id/report`, `:id/cancel`) live in
 * `simulation-actions.ts` to keep this file under the 300-line limit.
 */

import { z } from 'zod';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { simulationQueue } from '../../shared/queue.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { paginationSchema, uuidSchema } from '../../shared/validation.js';
import { scenarios, simulations } from '../../db/schema/tables.js';
import { SIMULATION_STATUS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { authGuard, requireTenant } from '../middleware/auth.js';

// ── Request Schemas ────────────────────────────────────────────────────

const createSimulationSchema = z.object({
  scenarioId: z.string().uuid(),
  agentCount: z.coerce.number().int().min(1).max(100000).optional(),
  roundCount: z.coerce.number().int().min(1).max(100).optional(),
  llmProvider: z.string().optional(),
});

const listSimulationsSchema = paginationSchema.extend({
  status: z.string().optional(),
});

// ── Routes ─────────────────────────────────────────────────────────────

export async function simulationRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/simulations ───────────────────────────────────────────
  app.post(
    '/api/simulations',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      const parsed = createSimulationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Invalid request body',
          parsed.error.issues,
        );
      }

      const { scenarioId, llmProvider } = parsed.data;
      const agentCount = parsed.data.agentCount ?? env.DEFAULT_AGENT_COUNT;
      const roundCount = parsed.data.roundCount ?? env.DEFAULT_ROUND_COUNT;

      // Verify scenario exists and belongs to this tenant
      const [scenario] = await db
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(
          and(
            eq(scenarios.id, scenarioId),
            eq(scenarios.tenantId, tenant.id),
          ),
        );

      if (!scenario) {
        throw new NotFoundError(`Scenario not found: ${scenarioId}`);
      }

      // Create simulation record with status: pending
      const [simulation] = await db
        .insert(simulations)
        .values({
          tenantId: tenant.id,
          scenarioId,
          status: SIMULATION_STATUS.PENDING,
          agentCount,
          roundCount,
          llmProvider: llmProvider ?? 'deepseek',
        })
        .returning({ id: simulations.id });

      // Add job to BullMQ queue with retry config
      await simulationQueue.add(
        'run-simulation',
        {
          simulationId: simulation.id,
          scenarioId,
          tenantId: tenant.id,
          agentCount,
          roundCount,
          llmProvider: llmProvider ?? 'deepseek',
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        },
      );

      return reply.status(201).send({
        simulationId: simulation.id,
        status: SIMULATION_STATUS.PENDING,
      });
    },
  );

  // ── GET /api/simulations ────────────────────────────────────────────
  app.get(
    '/api/simulations',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      const parsed = listSimulationsSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Invalid query parameters',
          parsed.error.issues,
        );
      }

      const { cursor, limit, status } = parsed.data;

      const conditions = [eq(simulations.tenantId, tenant.id)];

      if (status) {
        conditions.push(eq(simulations.status, status));
      }

      if (cursor) {
        const [cursorRow] = await db
          .select({ id: simulations.id, createdAt: simulations.createdAt })
          .from(simulations)
          .where(and(eq(simulations.id, cursor), eq(simulations.tenantId, tenant.id)));

        if (cursorRow) {
          const cursorCondition = or(
            lt(simulations.createdAt, cursorRow.createdAt),
            and(
              eq(simulations.createdAt, cursorRow.createdAt),
              lt(simulations.id, cursorRow.id),
            ),
          );
          if (cursorCondition) conditions.push(cursorCondition);
        }
      }

      // Fetch limit + 1 to detect next page
      const rows = await db
        .select({
          id: simulations.id,
          scenarioId: simulations.scenarioId,
          status: simulations.status,
          agentCount: simulations.agentCount,
          roundCount: simulations.roundCount,
          llmProvider: simulations.llmProvider,
          errorMessage: simulations.errorMessage,
          startedAt: simulations.startedAt,
          completedAt: simulations.completedAt,
          createdAt: simulations.createdAt,
        })
        .from(simulations)
        .where(and(...conditions))
        .orderBy(desc(simulations.createdAt), desc(simulations.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].id : null;

      return reply.send({ data, nextCursor });
    },
  );

  // ── GET /api/simulations/:id ────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/simulations/:id',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const id = idParse.data;

      const [simulation] = await db
        .select({
          id: simulations.id,
          scenarioId: simulations.scenarioId,
          status: simulations.status,
          mirofishProjectId: simulations.mirofishProjectId,
          mirofishSimId: simulations.mirofishSimId,
          agentCount: simulations.agentCount,
          roundCount: simulations.roundCount,
          llmProvider: simulations.llmProvider,
          errorMessage: simulations.errorMessage,
          costEstimateUsd: simulations.costEstimateUsd,
          startedAt: simulations.startedAt,
          completedAt: simulations.completedAt,
          createdAt: simulations.createdAt,
        })
        .from(simulations)
        .where(
          and(
            eq(simulations.id, id),
            eq(simulations.tenantId, tenant.id),
          ),
        );

      if (!simulation) {
        throw new NotFoundError(`Simulation not found: ${id}`);
      }

      return reply.send(simulation);
    },
  );
}
