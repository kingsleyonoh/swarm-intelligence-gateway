/**
 * Prediction API routes.
 *
 * Protected endpoints for querying structured predictions extracted
 * from completed simulations. All routes require X-API-Key auth and
 * scope results to the authenticated tenant.
 *
 * GET /api/predictions          — cursor pagination + theater/type/minConfidence filters
 * GET /api/predictions/latest   — latest high-confidence predictions (default minConfidence 0.7)
 *
 * Route ordering: `/latest` is registered before the generic list route
 * so Fastify matches the literal path first — otherwise the pattern-based
 * lookup for `:id` variants would swallow the literal path.
 */

import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db } from '../../shared/db.js';
import { ValidationError } from '../../shared/errors.js';
import { paginationSchema } from '../../shared/validation.js';
import { predictions } from '../../db/schema/tables.js';
import { MAX_PAGE_SIZE } from '../../config/constants.js';
import { authGuard, type RequestTenant } from '../middleware/auth.js';

// ── Query Schemas ───────────────────────────────────────────────────────

/** Query schema for GET /api/predictions. */
const listPredictionsSchema = paginationSchema.extend({
  theater: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
});

/** Query schema for GET /api/predictions/latest. */
const latestPredictionsSchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).default(0.7),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
});

// ── Response Column Set ────────────────────────────────────────────────

const PREDICTION_COLUMNS = {
  id: predictions.id,
  simulationId: predictions.simulationId,
  theater: predictions.theater,
  predictionType: predictions.predictionType,
  summary: predictions.summary,
  confidence: predictions.confidence,
  timeHorizon: predictions.timeHorizon,
  supportingFactions: predictions.supportingFactions,
  dissentingFactions: predictions.dissentingFactions,
  createdAt: predictions.createdAt,
};

// ── Routes ──────────────────────────────────────────────────────────────

export async function predictionRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/predictions/latest (literal path FIRST) ────────────────
  app.get(
    '/api/predictions/latest',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const parsed = latestPredictionsSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Invalid query parameters',
          parsed.error.issues,
        );
      }

      const { minConfidence, limit } = parsed.data;

      // Decimal columns compare as strings in Drizzle — convert to fixed
      const minConfidenceStr = minConfidence.toFixed(4);

      const rows = await db
        .select(PREDICTION_COLUMNS)
        .from(predictions)
        .where(
          and(
            eq(predictions.tenantId, tenant.id),
            gte(predictions.confidence, minConfidenceStr),
          ),
        )
        .orderBy(desc(predictions.createdAt))
        .limit(limit);

      return reply.send({ data: rows });
    },
  );

  // ── GET /api/predictions ────────────────────────────────────────────
  app.get(
    '/api/predictions',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const parsed = listPredictionsSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Invalid query parameters',
          parsed.error.issues,
        );
      }

      const { cursor, limit, theater, type, minConfidence } = parsed.data;

      const conditions = [eq(predictions.tenantId, tenant.id)];

      if (theater) {
        conditions.push(eq(predictions.theater, theater));
      }

      if (type) {
        conditions.push(eq(predictions.predictionType, type));
      }

      if (typeof minConfidence === 'number') {
        conditions.push(gte(predictions.confidence, minConfidence.toFixed(4)));
      }

      if (cursor) {
        const [cursorRow] = await db
          .select({ createdAt: predictions.createdAt })
          .from(predictions)
          .where(eq(predictions.id, cursor));

        if (cursorRow) {
          conditions.push(lt(predictions.createdAt, cursorRow.createdAt));
        }
      }

      const rows = await db
        .select(PREDICTION_COLUMNS)
        .from(predictions)
        .where(and(...conditions))
        .orderBy(desc(predictions.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].id : null;

      return reply.send({ data, nextCursor });
    },
  );
}

