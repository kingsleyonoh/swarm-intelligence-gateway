/**
 * Type definitions for SwarmPredictionsLayer (ScatterplotLayer).
 * Prediction markers at theater locations with radius and color mapping.
 */

/** A single prediction point for the scatterplot layer */
export interface PredictionPoint {
  /** Latitude of the theater location */
  lat: number;
  /** Longitude of the theater location */
  lng: number;
  /** Prediction confidence (0-1) */
  confidence: number;
  /** Prediction type key */
  type: string;
  /** Human-readable summary */
  summary: string;
  /** Theater name */
  theater: string;
  /** Source prediction ID */
  predictionId: string;
}

/** Scatterplot point config ready for deck.gl */
export interface ScatterplotPointConfig {
  position: [number, number];
  radius: number;
  color: [number, number, number, number];
  point: PredictionPoint;
}

/** Layer configuration object returned by create() */
export interface ScatterplotLayerConfig {
  type: 'scatterplot';
  points: ScatterplotPointConfig[];
}

/** Color mapping for prediction types: type key -> hex color */
export const PREDICTION_TYPE_COLORS: Record<string, string> = {
  escalation: '#e05252',
  de_escalation: '#4a90d9',
  market_shift: '#d4a843',
  sentiment_cascade: '#9b59b6',
};

/** Default color for unknown prediction types */
export const DEFAULT_PREDICTION_COLOR = '#888888';
