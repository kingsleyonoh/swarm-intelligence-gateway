/**
 * MiroFish API types.
 *
 * These types represent the request/response shapes for the MiroFish
 * Flask API endpoints used by the orchestrator to drive swarm simulations.
 */

// ── API Response Types ──────────────────────────────────────────────────

/** Response from `POST /ontology/generate` — returns project ID for tracking. */
export interface OntologyGenerateResponse {
  project_id: string;
}

/** Response from `POST /build` — returns build status. */
export interface BuildResponse {
  status: string;
}

/** Response from `POST /simulation/start` — returns simulation ID for polling. */
export interface SimulationStartResponse {
  simulation_id: string;
}

/** Response from `GET /ontology/status/:projectId` — ontology processing status. */
export interface OntologyStatusResponse {
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
}

/** Response from `GET /simulation/status/:simId` — simulation run status. */
export interface SimulationStatusResponse {
  status: 'running' | 'complete' | 'error';
  progress?: number;
  error?: string;
}

/** Response from `GET /simulation/report/:projectId` — full report text. */
export interface SimulationReportResponse {
  report: string;
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
