/**
 * Quick-launch API routes.
 *
 * POST /api/simulations/launch   — create scenario + simulation from template (auth required)
 * GET  /api/scenarios/templates  — list available scenario templates (public)
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { simulationQueue } from '../../shared/queue.js';
import { ValidationError } from '../../shared/errors.js';
import { scenarios, simulations } from '../../db/schema/tables.js';
import { SIMULATION_STATUS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { authGuard, type RequestTenant } from '../middleware/auth.js';
import {
  findTemplate,
  getTemplateSummaries,
} from '../../worldmonitor/scenario-templates.js';

// ── Request Schema ────────────────────────────────────────────────────

const launchSchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
});

// ── Routes ────────────────────────────────────────────────────────────

export async function quickLaunchRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ── GET /api/scenarios/templates ──────────────────────────────────
  app.get('/api/scenarios/templates', async (_request, reply) => {
    return reply.send({ templates: getTemplateSummaries() });
  });

  // ── POST /api/simulations/launch ─────────────────────────────────
  app.post(
    '/api/simulations/launch',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const tenant = (request as any).tenant as RequestTenant;

      const parsed = launchSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Invalid request body',
          parsed.error.issues,
        );
      }

      const { templateId } = parsed.data;
      const template = findTemplate(templateId);

      if (!template) {
        throw new ValidationError(
          `Unknown template: ${templateId}`,
        );
      }

      const runId = `quick-${Date.now()}`;

      // Create scenario from template
      const [scenario] = await db
        .insert(scenarios)
        .values({
          tenantId: tenant.id,
          worldmonitorRunId: runId,
          title: template.title,
          theaters: template.selectedTheaters,
          entities: template.entities,
          eventSeeds: template.eventSeeds,
          constraints: template.constraints,
          simulationRequirement: template.simulationRequirement,
          source: 'quick-launch',
        })
        .returning({ id: scenarios.id });

      const agentCount = env.DEFAULT_AGENT_COUNT;
      const roundCount = env.DEFAULT_ROUND_COUNT;

      // Create simulation record
      const [simulation] = await db
        .insert(simulations)
        .values({
          tenantId: tenant.id,
          scenarioId: scenario.id,
          status: SIMULATION_STATUS.PENDING,
          agentCount,
          roundCount,
          llmProvider: 'deepseek',
        })
        .returning({ id: simulations.id });

      // Enqueue simulation job
      await simulationQueue.add(
        'run-simulation',
        {
          simulationId: simulation.id,
          scenarioId: scenario.id,
          tenantId: tenant.id,
          agentCount,
          roundCount,
          llmProvider: 'deepseek',
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        },
      );

      return reply.status(201).send({
        scenarioId: scenario.id,
        simulationId: simulation.id,
        status: SIMULATION_STATUS.PENDING,
        template: {
          label: template.label,
          category: template.category,
        },
      });
    },
  );
}
