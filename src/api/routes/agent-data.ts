/**
 * Agent data API routes.
 *
 * Sub-resource routes for agent profiles and stance summaries:
 *   GET /api/simulations/:id/agents          — paginated agent profiles
 *   GET /api/simulations/:id/agents/summary  — stance distribution from predictions
 */

import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { uuidSchema } from '../../shared/validation.js';
import { agentProfiles, predictions, simulations } from '../../db/schema/tables.js';
import { authGuard, type RequestTenant } from '../middleware/auth.js';

// ── Request Schemas ────────────────────────────────────────────────────

const agentListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Helpers ────────────────────────────────────────────────────────────

/** Verify a simulation exists and belongs to the tenant. */
async function verifySimulation(simId: string, tenantId: string): Promise<void> {
  const [sim] = await db
    .select({ id: simulations.id })
    .from(simulations)
    .where(and(eq(simulations.id, simId), eq(simulations.tenantId, tenantId)));

  if (!sim) {
    throw new NotFoundError(`Simulation not found: ${simId}`);
  }
}

/** Map prediction types to stance categories. */
function predictionTypeToStance(type: string): string {
  switch (type) {
    case 'escalation': return 'escalate';
    case 'de_escalation': return 'de_escalate';
    case 'market_shift':
    case 'sentiment_cascade': return 'uncertain';
    default: return 'neutral';
  }
}

// ── Routes ─────────────────────────────────────────────────────────────

export async function agentDataRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/simulations/:id/agents ─────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/simulations/:id/agents',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const simId = idParse.data;

      const queryParse = agentListSchema.safeParse(request.query);
      if (!queryParse.success) {
        throw new ValidationError('Invalid query parameters');
      }
      const { limit, offset } = queryParse.data;

      await verifySimulation(simId, tenant.id);

      const [totalResult, rows] = await Promise.all([
        db.select({ count: count() })
          .from(agentProfiles)
          .where(and(
            eq(agentProfiles.simulationId, simId),
            eq(agentProfiles.tenantId, tenant.id),
          )),
        db.select({
          id: agentProfiles.id,
          agentId: agentProfiles.agentId,
          username: agentProfiles.username,
          name: agentProfiles.name,
          bio: agentProfiles.bio,
          persona: agentProfiles.persona,
          entityClass: agentProfiles.entityClass,
          stance: agentProfiles.stance,
          influenceWeight: agentProfiles.influenceWeight,
        })
          .from(agentProfiles)
          .where(and(
            eq(agentProfiles.simulationId, simId),
            eq(agentProfiles.tenantId, tenant.id),
          ))
          .limit(limit)
          .offset(offset),
      ]);

      return reply.send({
        data: rows,
        total: totalResult[0]?.count ?? 0,
      });
    },
  );

  // ── GET /api/simulations/:id/agents/summary ─────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/simulations/:id/agents/summary',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const simId = idParse.data;

      await verifySimulation(simId, tenant.id);

      // Derive stance distribution from predictions, weighted by confidence
      const preds = await db
        .select({
          predictionType: predictions.predictionType,
          confidence: predictions.confidence,
        })
        .from(predictions)
        .where(and(
          eq(predictions.simulationId, simId),
          eq(predictions.tenantId, tenant.id),
        ));

      if (preds.length === 0) {
        return reply.send({
          total: 0,
          stances: { escalate: 0, de_escalate: 0, uncertain: 0, neutral: 0 },
        });
      }

      // Weight each prediction by confidence
      const weights: Record<string, number> = {
        escalate: 0, de_escalate: 0, uncertain: 0, neutral: 0,
      };
      let totalWeight = 0;

      for (const pred of preds) {
        const stance = predictionTypeToStance(pred.predictionType);
        const conf = Number(pred.confidence);
        weights[stance] += conf;
        totalWeight += conf;
      }

      // Convert to percentages
      const stances = totalWeight > 0
        ? {
            escalate: Math.round((weights.escalate / totalWeight) * 100),
            de_escalate: Math.round((weights.de_escalate / totalWeight) * 100),
            uncertain: Math.round((weights.uncertain / totalWeight) * 100),
            neutral: Math.round((weights.neutral / totalWeight) * 100),
          }
        : { escalate: 0, de_escalate: 0, uncertain: 0, neutral: 0 };

      // Adjust rounding so it sums to exactly 100
      const sum = stances.escalate + stances.de_escalate + stances.uncertain + stances.neutral;
      if (sum !== 100 && totalWeight > 0) {
        const diff = 100 - sum;
        // Add the rounding difference to the largest category
        const max = Math.max(stances.escalate, stances.de_escalate, stances.uncertain, stances.neutral);
        if (stances.escalate === max) stances.escalate += diff;
        else if (stances.de_escalate === max) stances.de_escalate += diff;
        else if (stances.uncertain === max) stances.uncertain += diff;
        else stances.neutral += diff;
      }

      return reply.send({
        total: preds.length,
        stances,
      });
    },
  );
}
