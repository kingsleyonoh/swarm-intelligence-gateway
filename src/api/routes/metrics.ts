import { and, count, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { simulationQueue } from '../../shared/queue.js';
import { scenarios, simulations } from '../../db/schema/tables.js';
import { authGuard, requireTenant } from '../middleware/auth.js';

interface SimulationMetricsRow {
  total: number | string;
  failed: number | string;
  averageDurationMs: number | string | null;
}

/** Register tenant metrics and the global simulation queue depth endpoint. */
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/metrics', { preHandler: [authGuard] }, async (request, reply) => {
    const tenant = requireTenant(request);
    const [simulationResult, scenarioResult, queueCounts] = await Promise.all([
      db.select({
        total: count(),
        failed: sql<string>`count(*) FILTER (WHERE ${simulations.status} = 'failed')`,
        averageDurationMs: sql<string | null>`avg(EXTRACT(EPOCH FROM (${simulations.completedAt} - ${simulations.startedAt})) * 1000)`,
      })
        .from(simulations)
        .where(eq(simulations.tenantId, tenant.id)),
      db.select({ total: count() })
        .from(scenarios)
        .where(and(eq(scenarios.tenantId, tenant.id))),
      simulationQueue.getJobCounts('waiting', 'active', 'delayed', 'prioritized'),
    ]);

    const row = simulationResult[0] as SimulationMetricsRow | undefined;
    const total = Number(row?.total ?? 0);
    const failed = Number(row?.failed ?? 0);
    const queueDepth = Object.values(queueCounts).reduce((sum, value) => sum + value, 0);

    return reply.send({
      simulation_count: total,
      avg_duration_ms: Math.round(Number(row?.averageDurationMs ?? 0)),
      queue_depth: queueDepth,
      error_rate: total > 0 ? failed / total : 0,
      scenarios_ingested: Number(scenarioResult[0]?.total ?? 0),
    });
  });
}
