/**
 * Agent data API routes.
 *
 * Sub-resource routes for agent profiles and stance summaries:
 *   GET /api/simulations/:id/agents          — paginated agent profiles
 *   GET /api/simulations/:id/agents/summary  — stance distribution from predictions
 */

import { and, count, desc, eq, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { paginationSchema, uuidSchema } from '../../shared/validation.js';
import { agentProfiles, simulations } from '../../db/schema/tables.js';
import { authGuard, requireTenant } from '../middleware/auth.js';

// ── Request Schemas ────────────────────────────────────────────────────

const agentListSchema = paginationSchema.strict();

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
type StanceCategory = 'escalate' | 'de_escalate' | 'uncertain' | 'neutral';

function normalizeStance(value: string | null): StanceCategory {
  const stance = value?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? '';
  if (stance === 'de_escalate' || /peace|diplomat|dove|reconcil|de_escalat/.test(stance)) {
    return 'de_escalate';
  }
  if (stance === 'escalate' || /escalat|aggress|hawk|militant|confront/.test(stance)) {
    return 'escalate';
  }
  if (stance === 'uncertain' || /ambivalent|mixed|unknown/.test(stance)) return 'uncertain';
  return 'neutral';
}

function stancePercentages(profiles: Array<{ stance: string | null }>): Record<StanceCategory, number> {
  const counts: Record<StanceCategory, number> = {
    escalate: 0, de_escalate: 0, uncertain: 0, neutral: 0,
  };
  for (const profile of profiles) counts[normalizeStance(profile.stance)]++;
  if (profiles.length === 0) return counts;

  const percentages = (Object.keys(counts) as StanceCategory[]).reduce((result, category) => {
    result[category] = Math.round((counts[category] / profiles.length) * 100);
    return result;
  }, { ...counts });
  const sum = Object.values(percentages).reduce((total, value) => total + value, 0);
  if (sum !== 100) {
    const largest = (Object.keys(counts) as StanceCategory[])
      .reduce((current, category) => counts[category] > counts[current] ? category : current, 'neutral');
    percentages[largest] += 100 - sum;
  }
  return percentages;
}

// ── Routes ─────────────────────────────────────────────────────────────

export async function agentDataRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/simulations/:id/agents ─────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/simulations/:id/agents',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const simId = idParse.data;

      const queryParse = agentListSchema.safeParse(request.query);
      if (!queryParse.success) {
        throw new ValidationError('Invalid query parameters');
      }
      const { cursor, limit } = queryParse.data;

      await verifySimulation(simId, tenant.id);

      const conditions = [
        eq(agentProfiles.simulationId, simId),
        eq(agentProfiles.tenantId, tenant.id),
      ];
      if (cursor) {
        const [cursorRow] = await db
          .select({ id: agentProfiles.id, createdAt: agentProfiles.createdAt })
          .from(agentProfiles)
          .where(and(
            eq(agentProfiles.id, cursor),
            eq(agentProfiles.simulationId, simId),
            eq(agentProfiles.tenantId, tenant.id),
          ));
        if (cursorRow) {
          const cursorCondition = or(
            lt(agentProfiles.createdAt, cursorRow.createdAt),
            and(
              eq(agentProfiles.createdAt, cursorRow.createdAt),
              lt(agentProfiles.id, cursorRow.id),
            ),
          );
          if (cursorCondition) conditions.push(cursorCondition);
        }
      }

      const [totalResult, fetchedRows] = await Promise.all([
        db.select({ count: count() })
          .from(agentProfiles)
          .where(and(eq(agentProfiles.simulationId, simId), eq(agentProfiles.tenantId, tenant.id))),
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
          .where(and(...conditions))
          .orderBy(desc(agentProfiles.createdAt), desc(agentProfiles.id))
          .limit(limit + 1),
      ]);

      const hasMore = fetchedRows.length > limit;
      const rows = hasMore ? fetchedRows.slice(0, limit) : fetchedRows;

      return reply.send({
        data: rows,
        total: totalResult[0]?.count ?? 0,
        nextCursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
      });
    },
  );

  // ── GET /api/simulations/:id/agents/summary ─────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/simulations/:id/agents/summary',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = requireTenant(request);

      const idParse = uuidSchema.safeParse(request.params.id);
      if (!idParse.success) {
        throw new ValidationError('Invalid simulation id');
      }
      const simId = idParse.data;

      await verifySimulation(simId, tenant.id);

      const profiles = await db
        .select({
          stance: agentProfiles.stance,
        })
        .from(agentProfiles)
        .where(and(
          eq(agentProfiles.simulationId, simId),
          eq(agentProfiles.tenantId, tenant.id),
        ));

      return reply.send({
        total: profiles.length,
        stances: stancePercentages(profiles),
      });
    },
  );
}
