/**
 * Type definitions for ConsensusHeatLayer (HeatmapLayer).
 * Intensity = confidence, color = escalation type.
 */

/** A single heatmap data point */
export interface HeatmapPoint {
  /** Latitude */
  lat: number;
  /** Longitude */
  lng: number;
  /** Weight/intensity (derived from confidence) */
  intensity: number;
  /** Prediction type (determines color band) */
  type: string;
  /** Source prediction ID */
  predictionId: string;
}

/** Weighted point config ready for deck.gl HeatmapLayer */
export interface HeatmapPointConfig {
  position: [number, number];
  weight: number;
  colorCategory: 'escalation' | 'de_escalation' | 'other';
}

/** Layer configuration object returned by create() */
export interface HeatmapLayerConfig {
  type: 'heatmap';
  points: HeatmapPointConfig[];
  enabled: boolean;
  threshold: number;
}

/** Escalation type hex (red) */
export const HEATMAP_ESCALATION_COLOR = '#e05252';

/** De-escalation type hex (green / blue) */
export const HEATMAP_DE_ESCALATION_COLOR = '#4a90d9';
