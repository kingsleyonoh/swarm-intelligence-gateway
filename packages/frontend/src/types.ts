/**
 * Core frontend type definitions for the Swarm Intelligence Gateway.
 * Follows WorldMonitor's panel/layer/variant architecture patterns.
 */

/** Panel lifecycle interface — each panel implements this */
export interface Panel {
  /** Unique panel identifier */
  readonly id: string;
  /** Human-readable panel title */
  readonly title: string;
  /** Mount panel into a container element */
  mount(container: HTMLElement): void;
  /** Remove panel from DOM, clean up event listeners */
  unmount(): void;
  /** Update panel with new data */
  update(data: unknown): void;
}

/** Panel constructor type for registry */
export type PanelConstructor = new () => Panel;

/** Map layer lifecycle interface */
export interface MapLayer {
  /** Unique layer identifier */
  readonly id: string;
  /** Layer type descriptor (scatterplot, geojson, heatmap) */
  readonly type: string;
  /** Create layer with initial data, returns framework-specific layer object */
  create(data: unknown): unknown;
  /** Update layer with new data */
  update(data: unknown): void;
  /** Destroy layer, free resources */
  destroy(): void;
}

/** Map layer constructor type for registry */
export type MapLayerConstructor = new () => MapLayer;

/** Layer visibility configuration */
export interface LayerConfig {
  /** Layer ID */
  id: string;
  /** Whether visible by default */
  visible: boolean;
  /** Render order (lower = rendered first / below) */
  order: number;
}

/** Panel display configuration */
export interface PanelConfig {
  /** Panel ID */
  id: string;
  /** Display order in panel container (lower = higher) */
  order: number;
  /** Whether panel is expanded by default */
  expanded: boolean;
}

/** Refresh interval configuration (milliseconds) */
export interface RefreshIntervals {
  /** Theater/simulation status polling interval */
  simulations: number;
  /** Prediction data polling interval */
  predictions: number;
  /** Faction/report data polling interval */
  factions: number;
  /** Heatmap data polling interval */
  heatmap: number;
}

/** Variant configuration — defines what panels, layers, and settings a variant uses */
export interface VariantConfig {
  /** Unique variant identifier */
  id: string;
  /** Human-readable variant name */
  name: string;
  /** Ordered list of panels to display */
  panels: PanelConfig[];
  /** Map layers with visibility and order */
  layers: LayerConfig[];
  /** Polling refresh intervals */
  refreshIntervals: RefreshIntervals;
  /** API base URL (defaults to window.location.origin) */
  apiBaseUrl: string;
}

/** Prediction types matching backend constants */
export const PREDICTION_TYPE = {
  ESCALATION: 'escalation',
  DE_ESCALATION: 'de_escalation',
  MARKET_SHIFT: 'market_shift',
  SENTIMENT_CASCADE: 'sentiment_cascade',
} as const;

export type PredictionType =
  (typeof PREDICTION_TYPE)[keyof typeof PREDICTION_TYPE];

/** Simulation statuses matching backend constants */
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

/** SmartPollLoop callback type */
export type PollCallback<T> = (data: T) => void;

/** SmartPollLoop error callback type */
export type PollErrorCallback = (error: Error) => void;

/** SmartPollLoop configuration */
export interface PollConfig<T> {
  /** URL to poll */
  url: string;
  /** Polling interval in milliseconds */
  intervalMs: number;
  /** Success callback */
  onData: PollCallback<T>;
  /** Error callback */
  onError?: PollErrorCallback;
  /** Maximum consecutive errors before stopping (default: 5) */
  maxErrors?: number;
  /** Backoff multiplier on error (default: 1.5) */
  backoffMultiplier?: number;
  /** Custom fetch options */
  fetchOptions?: RequestInit;
}
