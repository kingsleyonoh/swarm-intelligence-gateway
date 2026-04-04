/**
 * Simulation status machine:
 * pending -> queued -> graph_building -> simulating -> reporting -> completed | failed | cancelled
 */
export const SIMULATION_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  GRAPH_BUILDING: 'graph_building',
  SIMULATING: 'simulating',
  REPORTING: 'reporting',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type SimulationStatus =
  (typeof SIMULATION_STATUS)[keyof typeof SIMULATION_STATUS];

export const PREDICTION_TYPE = {
  ESCALATION: 'escalation',
  DE_ESCALATION: 'de_escalation',
  MARKET_SHIFT: 'market_shift',
  SENTIMENT_CASCADE: 'sentiment_cascade',
} as const;

export type PredictionType =
  (typeof PREDICTION_TYPE)[keyof typeof PREDICTION_TYPE];

export const SCENARIO_SOURCE = {
  POLLER: 'poller',
  MANUAL: 'manual',
  WEBHOOK: 'webhook',
} as const;

export type ScenarioSource =
  (typeof SCENARIO_SOURCE)[keyof typeof SCENARIO_SOURCE];

/** Pagination defaults */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Simulation defaults */
export const MAX_ENTITY_COUNT = 20;
export const DEFAULT_AGENT_COUNT = 4096;
export const DEFAULT_ROUND_COUNT = 5;

/** Standardised error codes returned in API error responses */
export const ERROR_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];
