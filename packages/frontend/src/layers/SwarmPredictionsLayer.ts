/**
 * SwarmPredictionsLayer — ScatterplotLayer for prediction markers.
 *
 * Renders prediction markers at theater locations on the globe.
 * Radius = confidence x 50, color = prediction type.
 * Processes data into deck.gl-compatible config without requiring WebGL.
 */

import type { MapLayer } from '../types.js';
import type {
  PredictionPoint,
  ScatterplotPointConfig,
  ScatterplotLayerConfig,
} from './prediction-layer-types.js';
import {
  PREDICTION_TYPE_COLORS,
  DEFAULT_PREDICTION_COLOR,
} from './prediction-layer-types.js';

/** Parse hex color string to RGBA tuple */
function hexToRgba(
  hex: string,
  alpha: number,
): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b, alpha];
}

/** Convert a PredictionPoint to a ScatterplotPointConfig */
function toPointConfig(point: PredictionPoint): ScatterplotPointConfig {
  const hex =
    PREDICTION_TYPE_COLORS[point.type] ?? DEFAULT_PREDICTION_COLOR;
  return {
    position: [point.lng, point.lat],
    radius: point.confidence * 50,
    color: hexToRgba(hex, 200),
    point,
  };
}

export class SwarmPredictionsLayer implements MapLayer {
  readonly id = 'swarm-predictions';
  readonly type = 'scatterplot';

  private config: ScatterplotLayerConfig | null = null;

  create(data: unknown): ScatterplotLayerConfig {
    const predictions = toSafePredictionArray(data);
    this.config = {
      type: 'scatterplot',
      points: predictions.map(toPointConfig),
    };
    return this.config;
  }

  update(data: unknown): void {
    const predictions = toSafePredictionArray(data);
    this.config = {
      type: 'scatterplot',
      points: predictions.map(toPointConfig),
    };
  }

  destroy(): void {
    this.config = null;
  }

  /** Get current layer config (for testing and external access) */
  getConfig(): ScatterplotLayerConfig | null {
    return this.config;
  }
}

/** Safely coerce unknown data to a PredictionPoint array */
function toSafePredictionArray(data: unknown): PredictionPoint[] {
  if (!data || !Array.isArray(data)) return [];
  return data as PredictionPoint[];
}
