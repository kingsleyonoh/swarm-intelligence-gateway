/**
 * Simulation action + sub-resource routes.
 *
 * These are pulled out of `simulations.ts` to keep each file focused and
 * under the 300-line limit.
 *
 *   GET  /api/simulations/:id/report    — completed simulation report + predictions
 *   GET  /api/simulations/:id/progress — live progress (status, elapsed, phase)
 *   POST /api/simulations/:id/cancel   — cancel a running simulation
 */

import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors.js';
import { uuidSchema } from '../../shared/validation.js';
import { predictions, simulations } from '../../db/schema/tables.js';
import { SIMULATION_STATUS } from '../../config/constants.js';
import { authGuard, type RequestTenant } from '../middleware/auth.js';

// ── Helpers ─────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set<string>([
  SIMULATION_STATUS.COMPLETED,
  SIMULATION_STATUS.FAILED,
  SIMULATION_STATUS.CANCELLED,
]);

// ── Routes ──────────────────────────────────────────────────────────────

export async function simulationActionRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/simulations/:id/report ─────────────────────────────────
  // Registered BEFORE /:id so Fastify matches the longer path first.
  app.get<{ Params: { id: string } }>(
    '/api/simulations/:id/report',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const id = idParse.data;

      const [simulation] = await db
        .select({
          id: simulations.id,
          status: simulations.status,
          report: simulations.report,
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

      if (simulation.status !== SIMULATION_STATUS.COMPLETED) {
        throw new NotFoundError(
          `Report not available: simulation ${id} has status '${simulation.status}'`,
        );
      }

      const simPredictions = await db
        .select({
          id: predictions.id,
          theater: predictions.theater,
          predictionType: predictions.predictionType,
          summary: predictions.summary,
          confidence: predictions.confidence,
          timeHorizon: predictions.timeHorizon,
          supportingFactions: predictions.supportingFactions,
          dissentingFactions: predictions.dissentingFactions,
          createdAt: predictions.createdAt,
        })
        .from(predictions)
        .where(
          and(
            eq(predictions.simulationId, id),
            eq(predictions.tenantId, tenant.id),
          ),
        );

      return reply.send({
        report: simulation.report ?? '',
        predictions: simPredictions,
      });
    },
  );

  // ── GET /api/simulations/:id/progress ────────────────────────────────
  // Live progress for a simulation: status, elapsed time, phase label.
  app.get<{ Params: { id: string } }>(
    '/api/simulations/:id/progress',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const id = idParse.data;

      const [sim] = await db
        .select({
          id: simulations.id,
          status: simulations.status,
          startedAt: simulations.startedAt,
          completedAt: simulations.completedAt,
          agentCount: simulations.agentCount,
          roundCount: simulations.roundCount,
        })
        .from(simulations)
        .where(
          and(
            eq(simulations.id, id),
            eq(simulations.tenantId, tenant.id),
          ),
        );

      if (!sim) {
        throw new NotFoundError(`Simulation not found: ${id}`);
      }

      const now = new Date();
      const startedAt = sim.startedAt ? new Date(sim.startedAt) : now;
      const elapsedMs = sim.completedAt
        ? new Date(sim.completedAt).getTime() - startedAt.getTime()
        : now.getTime() - startedAt.getTime();

      const PHASE_LABELS: Record<string, string> = {
        pending: 'Queued for processing',
        queued: 'Waiting for worker',
        graph_building: 'Building knowledge graph',
        simulating: 'Running swarm simulation',
        reporting: 'Generating analysis report',
        completed: 'Analysis complete',
        failed: 'Simulation failed',
        cancelled: 'Simulation cancelled',
      };

      return reply.send({
        status: sim.status,
        phase: PHASE_LABELS[sim.status] ?? sim.status,
        elapsedMs,
        agentCount: sim.agentCount,
        roundCount: sim.roundCount,
        isActive: !TERMINAL_STATUSES.has(sim.status),
      });
    },
  );

  // ── POST /api/simulations/:id/cancel ────────────────────────────────
  // Cancel a pending/queued/running simulation. Already-completed,
  // already-cancelled, or failed simulations return 409 Conflict.
  app.post<{ Params: { id: string } }>(
    '/api/simulations/:id/cancel',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const id = idParse.data;

      const [sim] = await db
        .select({ id: simulations.id, status: simulations.status })
        .from(simulations)
        .where(
          and(
            eq(simulations.id, id),
            eq(simulations.tenantId, tenant.id),
          ),
        );

      if (!sim) {
        throw new NotFoundError(`Simulation not found: ${id}`);
      }

      if (TERMINAL_STATUSES.has(sim.status)) {
        throw new ConflictError(
          `Cannot cancel simulation in terminal state: ${sim.status}`,
        );
      }

      await db
        .update(simulations)
        .set({
          status: SIMULATION_STATUS.CANCELLED,
          completedAt: new Date(),
        })
        .where(eq(simulations.id, id));

      return reply.send({ status: SIMULATION_STATUS.CANCELLED });
    },
  );
}
