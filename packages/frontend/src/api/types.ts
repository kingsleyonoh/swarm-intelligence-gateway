/**
 * API response types for the Swarm Gateway REST API.
 * These types match the backend response shapes.
 */

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

/** Simulation row from GET /api/simulations */
export interface SimulationRow {
  id: string;
  tenantId: string;
  scenarioId: string;
  status: string;
  seedDocument: string | null;
  report: string | null;
  costEstimateUsd: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Prediction row from GET /api/predictions */
export interface PredictionRow {
  id: string;
  simulationId: string;
  theater: string;
  predictionType: string;
  summary: string;
  confidence: number;
  timeHorizon: string;
  supportingFactions: string[];
  dissentingFactions: string[];
  createdAt: string;
}

/** Simulation report response from GET /api/simulations/:id/report */
export interface SimulationReportResponse {
  report: string;
  predictions: PredictionRow[];
}

/** Parameters for getSimulations */
export interface GetSimulationsParams {
  status?: string;
  limit?: number;
  cursor?: string;
}

/** Parameters for getPredictions */
export interface GetPredictionsParams {
  limit?: number;
  cursor?: string;
}

/** Parameters for getLatestPredictions */
export interface GetLatestPredictionsParams {
  minConfidence?: number;
  limit?: number;
}
