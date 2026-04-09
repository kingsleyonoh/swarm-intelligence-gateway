/**
 * MiroFish Simulation Orchestrator.
 *
 * Drives the full simulation pipeline:
 * 1. Load scenario from DB
 * 2. Create simulation record (status: queued)
 * 3. Graph Build Phase (graph_building): seed doc → ontology → build
 * 4. Simulation Phase (simulating): start sim → poll until complete
 * 5. Report Phase (reporting): retrieve report → parse predictions
 * 6. Update status to completed
 *
 * Each phase updates the simulation status in DB. On failure, the
 * simulation is marked as `failed` with the error message stored.
 */

import { eq, and } from 'drizzle-orm';

import { SIMULATION_STATUS } from '../config/constants.js';
import { env } from '../config/env.js';
import { scenarios, simulations } from '../db/schema/tables.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { db } from '../shared/db.js';
import { createChildLogger } from '../shared/logger.js';
import { generateSeedDocument } from '../transformer/seed-document.js';
import type { SimPackage } from '../worldmonitor/types.js';

import { MirofishClient } from './client.js';
import { insertPredictions, storeActionLogs, storeProfiles } from './data-store.js';
import { parsePredictions } from './prediction-parser.js';

import type { MirofishConfig } from './types.js';

const log = createChildLogger({ module: 'orchestrator' });

/**
 * Convert a DB scenario row to the SimPackage shape expected by transformers.
 *
 * DB stores JSONB fields (`theaters`, `entities`, `eventSeeds`, `constraints`)
 * while SimPackage uses `selectedTheaters` for the theaters field.
 */
function toSimPackage(row: Record<string, unknown>): SimPackage {
  return {
    runId: (row.worldmonitorRunId as string) ?? '',
    timestamp: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt ?? ''),
    title: row.title as string,
    selectedTheaters: row.theaters as SimPackage['selectedTheaters'],
    entities: row.entities as SimPackage['entities'],
    eventSeeds: row.eventSeeds as SimPackage['eventSeeds'],
    constraints: row.constraints as SimPackage['constraints'],
    simulationRequirement: row.simulationRequirement as string,
  };
}

/** Default timeout for ontology generation polling (10 minutes). */
const ONTOLOGY_TIMEOUT_MS = 600_000;

/** Default timeout for simulation polling (30 minutes). */
const SIMULATION_TIMEOUT_MS = 1_800_000;

// ── Orchestrator Parameters ─────────────────────────────────────────

export interface RunSimulationParams {
  /** If provided, use this existing simulation record instead of creating a new one. */
  simulationId?: string;
  scenarioId: string;
  tenantId: string;
  agentCount?: number;
  roundCount?: number;
  llmProvider?: string;
}

// ── Status Update Helper ────────────────────────────────────────────

async function updateSimulationStatus(
  simulationId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db
    .update(simulations)
    .set({ status, ...extra })
    .where(eq(simulations.id, simulationId));
}

async function failSimulation(
  simulationId: string,
  errorMessage: string,
): Promise<void> {
  await updateSimulationStatus(simulationId, SIMULATION_STATUS.FAILED, {
    errorMessage,
    completedAt: new Date(),
  });
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Run the full MiroFish simulation pipeline for a scenario.
 *
 * @returns The simulation ID created for this run.
 * @throws NotFoundError if the scenario does not exist.
 * @throws ConflictError if a simulation already exists for this scenario.
 */
export async function runSimulation(
  params: RunSimulationParams,
): Promise<string> {
  const { scenarioId, tenantId } = params;
  const agentCount = params.agentCount ?? env.DEFAULT_AGENT_COUNT;
  const roundCount = params.roundCount ?? env.DEFAULT_ROUND_COUNT;
  const llmProvider = params.llmProvider ?? 'deepseek';

  log.info({ scenarioId, tenantId, agentCount, roundCount }, 'Starting simulation pipeline');

  // ── Step 1: Load scenario ─────────────────────────────────────────

  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId));

  if (!scenario) {
    throw new NotFoundError(`Scenario not found: ${scenarioId}`);
  }

  // ── Step 2: Use existing simulation or create new one ─────────────

  let simulationId: string;

  if (params.simulationId) {
    // Simulation already created by the API route — just update status
    simulationId = params.simulationId;
    await updateSimulationStatus(simulationId, SIMULATION_STATUS.QUEUED, {
      startedAt: new Date(),
    });
    log.info({ simulationId, scenarioId }, 'Using existing simulation record');
  } else {
    // No pre-created record — check for duplicates and create
    const [existingSim] = await db
      .select()
      .from(simulations)
      .where(
        and(
          eq(simulations.scenarioId, scenarioId),
          eq(simulations.tenantId, tenantId),
        ),
      );

    if (existingSim) {
      throw new ConflictError(
        `Simulation already exists for scenario ${scenarioId}: ${existingSim.id}`,
      );
    }

    const [simulation] = await db
      .insert(simulations)
      .values({
        tenantId,
        scenarioId,
        status: SIMULATION_STATUS.QUEUED,
        agentCount,
        roundCount,
        llmProvider,
        startedAt: new Date(),
      })
      .returning({ id: simulations.id });

    simulationId = simulation.id;
    log.info({ simulationId, scenarioId }, 'Simulation record created');
  }

  const mirofishClient = new MirofishClient(
    env.MIROFISH_API_URL ?? 'http://localhost:5000',
  );

  const config: MirofishConfig = { agentCount, roundCount, llmProvider };

  try {
    // ── Step 4: Graph Build Phase ─────────────────────────────────────

    await updateSimulationStatus(simulationId, SIMULATION_STATUS.GRAPH_BUILDING);

    const simPackage = toSimPackage(scenario);
    const seedDoc = generateSeedDocument(simPackage);
    const seedMarkdown = seedDoc.markdown;

    // Store seed document
    await updateSimulationStatus(simulationId, SIMULATION_STATUS.GRAPH_BUILDING, {
      seedDocument: seedMarkdown,
    });

    // Append English language instruction to ensure MiroFish outputs in English
    const simRequirement = scenario.simulationRequirement +
      '\n\nIMPORTANT: Generate ALL output in English, including agent profiles, simulation posts, and the final report.';

    const ontologyResult = await mirofishClient.generateOntology(
      seedMarkdown,
      simRequirement,
      `sim-${simulationId}`,
    );

    const mirofishProjectId = ontologyResult.data.project_id;

    // Store MiroFish project ID
    await updateSimulationStatus(simulationId, SIMULATION_STATUS.GRAPH_BUILDING, {
      mirofishProjectId,
    });

    // Ontology generation is synchronous — go straight to graph build.
    // Graph build is ASYNC — returns a task_id we need to poll.
    const buildResult = await mirofishClient.buildGraph(mirofishProjectId);
    const buildTaskId = buildResult.data?.task_id;

    if (buildTaskId) {
      await mirofishClient.pollTask(buildTaskId, 'Graph build', ONTOLOGY_TIMEOUT_MS);
    }

    log.info({ simulationId, mirofishProjectId }, 'Graph build phase complete');

    // ── Step 5: Simulation Phase ────────────────────────────────────

    await updateSimulationStatus(simulationId, SIMULATION_STATUS.SIMULATING);

    // MiroFish requires create → prepare → start (three-step)
    const createResult = await mirofishClient.createSimulation(mirofishProjectId);
    const mirofishSimId = createResult.data.simulation_id;

    // Save MiroFish sim ID for later data fetching
    await updateSimulationStatus(simulationId, SIMULATION_STATUS.SIMULATING, {
      mirofishSimId,
    });

    log.info({ simulationId, mirofishSimId }, 'Preparing simulation (profiles + config)');
    await mirofishClient.prepareSimulation(mirofishSimId);
    await mirofishClient.pollPrepareStatus(mirofishSimId, ONTOLOGY_TIMEOUT_MS);

    // Fetch and store agent profiles generated during prepare
    try {
      const profiles = await mirofishClient.fetchProfiles(mirofishSimId);
      if (profiles.length > 0) {
        await storeProfiles(simulationId, tenantId, profiles);
        log.info({ simulationId, count: profiles.length }, 'Stored agent profiles');
      }
    } catch (err) {
      log.warn({ simulationId, err }, 'Failed to fetch profiles — continuing without');
    }

    log.info({ simulationId, mirofishSimId }, 'Starting simulation');
    await mirofishClient.startSimulation(mirofishSimId, config);

    await mirofishClient.pollSimulationStatus(mirofishSimId, SIMULATION_TIMEOUT_MS);

    // Fetch and store action logs from the completed simulation
    try {
      const actions = await mirofishClient.fetchActionLog(mirofishSimId);
      if (actions.length > 0) {
        await storeActionLogs(simulationId, tenantId, actions);
        log.info({ simulationId, count: actions.length }, 'Stored agent action logs');
      }
    } catch (err) {
      log.warn({ simulationId, err }, 'Failed to fetch action logs — continuing without');
    }

    log.info({ simulationId, mirofishSimId }, 'Simulation phase complete');

    // ── Step 6: Report Phase ────────────────────────────────────────

    await updateSimulationStatus(simulationId, SIMULATION_STATUS.REPORTING);

    // Report generation is async in MiroFish — trigger, poll (by task_id), then fetch
    log.info({ simulationId, mirofishSimId }, 'Generating report');
    const reportResult = await mirofishClient.generateReport(mirofishSimId);
    const reportData = (reportResult.data ?? reportResult) as Record<string, unknown>;
    const reportTaskId = reportData.task_id as string;

    if (reportTaskId) {
      await mirofishClient.pollReportStatus(reportTaskId, ONTOLOGY_TIMEOUT_MS);
    }

    const { report } = await mirofishClient.getReport(mirofishSimId);

    // Parse predictions from the report text
    const extractedPredictions = parsePredictions(report);

    // Persist parsed predictions — tenant-scoped via simulation
    if (extractedPredictions.length > 0) {
      await insertPredictions(simulationId, tenantId, extractedPredictions);
    }

    // Store report and mark complete
    await updateSimulationStatus(simulationId, SIMULATION_STATUS.COMPLETED, {
      report,
      completedAt: new Date(),
    });

    log.info(
      { simulationId, predictionCount: extractedPredictions.length },
      'Simulation pipeline completed successfully',
    );

    return simulationId;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ simulationId, tenantId, error: errorMessage }, 'Simulation pipeline failed');

    // Mark simulation failed — but never let a DB write failure mask the
    // original pipeline error. If failSimulation itself throws, log the
    // secondary error and still re-throw the original.
    try {
      await failSimulation(simulationId, errorMessage);
    } catch (failErr) {
      log.error(
        {
          simulationId,
          tenantId,
          originalError: errorMessage,
          failUpdateError: (failErr as Error).message,
        },
        'Failed to persist failed simulation status — original error preserved',
      );
    }

    throw err;
  }
}
