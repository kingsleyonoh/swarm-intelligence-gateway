/**
 * Shared fixture helpers for prediction API tests.
 *
 * Kept separate so `predictions.test.ts` and `predictions-latest.test.ts`
 * can reuse the same scenario/simulation/prediction factories without
 * bloating either file past the 300-line limit.
 */

import { db } from '../../src/shared/db.js';
import {
  scenarios,
  simulations,
  predictions,
} from '../../src/db/schema/tables.js';
import {
  SCENARIO_SOURCE,
  SIMULATION_STATUS,
  PREDICTION_TYPE,
} from '../../src/config/constants.js';

export async function createPredScenario(tenantId: string, title = 'Pred Test Scenario') {
  const [row] = await db
    .insert(scenarios)
    .values({
      tenantId,
      title,
      theaters: [
        {
          label: 'Persian Gulf',
          region: 'ME',
          route: 'x',
          stateKind: 'conflict',
          rankingScore: 0.9,
        },
      ],
      entities: [
        {
          name: 'E',
          class: 'state_actor',
          stance: 'neutral',
          objectives: [],
          constraints: [],
          relationships: [],
        },
      ],
      eventSeeds: [{ type: 't', summary: 's', timing: 'near-term', strength: 0.5 }],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'Test',
      source: SCENARIO_SOURCE.MANUAL,
    })
    .returning({ id: scenarios.id });
  return row;
}

export async function createPredSimulation(tenantId: string, scenarioId: string) {
  const [row] = await db
    .insert(simulations)
    .values({
      tenantId,
      scenarioId,
      status: SIMULATION_STATUS.COMPLETED,
      agentCount: 4096,
      roundCount: 5,
      llmProvider: 'deepseek',
      report: '## Report',
    })
    .returning({ id: simulations.id });
  return row;
}

export async function createPrediction(
  tenantId: string,
  simulationId: string,
  overrides: Partial<{
    theater: string;
    predictionType: string;
    summary: string;
    confidence: string;
    timeHorizon: string;
  }> = {},
) {
  const [row] = await db
    .insert(predictions)
    .values({
      tenantId,
      simulationId,
      theater: overrides.theater ?? 'Persian Gulf',
      predictionType: overrides.predictionType ?? PREDICTION_TYPE.ESCALATION,
      summary: overrides.summary ?? 'Tensions rising',
      confidence: overrides.confidence ?? '0.75',
      timeHorizon: overrides.timeHorizon ?? '72h',
      supportingFactions: [],
      dissentingFactions: [],
    })
    .returning({ id: predictions.id });
  return row;
}
