/**
 * MiroFish API types.
 *
 * These types represent the request/response shapes for the MiroFish
 * Flask API endpoints used by the orchestrator to drive swarm simulations.
 */

// ── API Response Types ──────────────────────────────────────────────────

/**
 * Response from `POST /api/graph/ontology/generate`.
 * Ontology generation is synchronous — returns after LLM finishes.
 * The project_id is nested under `data`.
 */
export interface OntologyGenerateResponse {
  data: {
    project_id: string;
    [key: string]: unknown;
  };
  success: boolean;
}

/** Response from `POST /api/graph/build` — async, returns task ID for polling. */
export interface BuildResponse {
  data: {
    task_id: string;
    project_id: string;
    message: string;
  };
  success: boolean;
}

/** Response from `GET /api/graph/task/:taskId` — task polling status. */
export interface TaskStatusResponse {
  status: 'pending' | 'processing' | 'complete' | 'completed' | 'error' | 'failed';
  error?: string;
  [key: string]: unknown;
}

/** Response from `POST /api/simulation/start` — returns simulation ID for polling. */
export interface SimulationStartResponse {
  simulation_id: string;
}

/** Response from `GET /api/simulation/:simId/run-status` — simulation run status. */
export interface SimulationStatusResponse {
  status: 'running' | 'complete' | 'error';
  progress?: number;
  error?: string;
}

/** Response from `GET /api/report/by-simulation/:simulationId` — full report text. */
export interface SimulationReportResponse {
  report: string;
  [key: string]: unknown;
}

// ── Action Log Types ────────────────────────────────────────────────────

/**
 * A single action log entry from MiroFish JSONL output.
 *
 * Each line in the action log represents one agent action during a
 * simulation round (e.g. CREATE_POST, LIKE_POST, COMMENT, REPOST).
 */
export interface ActionLogEntry {
  agent_id: number;
  round: number;
  platform: string;
  action_type: string;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Client Configuration ────────────────────────────────────────────────

/** Configuration passed to MiroFish simulation start. */
export interface MirofishConfig {
  agentCount: number;
  roundCount: number;
  llmProvider: string;
}
