/**
 * Simulation API routes.
 *
 * Protected endpoints for triggering and listing simulations.
 * All routes require X-API-Key authentication via authGuard.
 *
 * POST /api/simulations  — trigger a simulation from a scenario
 * GET  /api/simulations  — list simulations with cursor pagination + status filter
 */

import { z } from 'zod';
import { eq, and, lt, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { simulationQueue } from '../../shared/queue.js';
import { ValidationError, NotFoundError } from '../../shared/errors.js';
import { paginationSchema, uuidSchema } from '../../shared/validation.js';
import { scenarios, simulations } from '../../db/schema/tables.js';
import { SIMULATION_STATUS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { authGuard, type RequestTenant } from '../middleware/auth.js';

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
      const tenant = (request as any).tenant as RequestTenant;

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
      const tenant = (request as any).tenant as RequestTenant;

      const parsed = listSimulationsSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Invalid query parameters',
          parsed.error.issues,
        );
      }

      const { cursor, limit, status } = parsed.data;

      // Build WHERE conditions
      const conditions = [eq(simulations.tenantId, tenant.id)];

      if (status) {
        conditions.push(eq(simulations.status, status));
      }

      if (cursor) {
        // Look up the cursor simulation to get its createdAt for ordering
        const [cursorRow] = await db
          .select({ createdAt: simulations.createdAt })
          .from(simulations)
          .where(eq(simulations.id, cursor));

        if (cursorRow) {
          conditions.push(lt(simulations.createdAt, cursorRow.createdAt));
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
        .orderBy(desc(simulations.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].id : null;

      return reply.send({ data, nextCursor });
    },
  );
}
