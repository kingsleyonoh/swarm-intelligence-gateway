/**
 * ConsensusHeatLayer — HeatmapLayer for consensus intensity visualization.
 *
 * Intensity = confidence, color category = escalation (red) / de_escalation (blue).
 * Supports threshold filtering and enable/disable toggle.
 * Listens for heatmap-settings-change CustomEvent from ConsensusHeatmapPanel.
 * Processes data into deck.gl-compatible config without requiring WebGL.
 */

import type { MapLayer } from '../types.js';
import type {
  HeatmapPoint,
  HeatmapPointConfig,
  HeatmapLayerConfig,
} from './heatmap-layer-types.js';

/** Determine the color category for a prediction type */
function categorize(
  type: string,
): 'escalation' | 'de_escalation' | 'other' {
  if (type === 'escalation') return 'escalation';
  if (type === 'de_escalation') return 'de_escalation';
  return 'other';
}

/** Convert a HeatmapPoint to a HeatmapPointConfig */
function toPointConfig(point: HeatmapPoint): HeatmapPointConfig {
  return {
    position: [point.lng, point.lat],
    weight: point.intensity,
    colorCategory: categorize(point.type),
  };
}

export class ConsensusHeatLayer implements MapLayer {
  readonly id = 'consensus-heat';
  readonly type = 'heatmap';

  private config: HeatmapLayerConfig | null = null;
  private enabled = false;
  private threshold = 0.5;
  private rawPoints: HeatmapPoint[] = [];

  create(data: unknown): HeatmapLayerConfig {
    this.rawPoints = toSafePointArray(data);
    this.config = this.buildConfig();
    return this.config;
  }

  update(data: unknown): void {
    this.rawPoints = toSafePointArray(data);
    this.config = this.buildConfig();
  }

  destroy(): void {
    this.config = null;
    this.rawPoints = [];
    this.enabled = false;
    this.threshold = 0.5;
  }

  /** Set the intensity threshold filter */
  setThreshold(value: number): void {
    this.threshold = value;
    if (this.config) {
      this.config = this.buildConfig();
    }
  }

  /** Toggle layer enabled state */
  setEnabled(value: boolean): void {
    this.enabled = value;
    if (this.config) {
      this.config.enabled = value;
    }
  }

  /** Apply settings from heatmap-settings-change event */
  applySettings(settings: {
    enabled: boolean;
    intensityThreshold: number;
  }): void {
    this.enabled = settings.enabled;
    this.threshold = settings.intensityThreshold;
    if (this.config) {
      this.config = this.buildConfig();
    }
  }

  /** Get current layer config (for testing and external access) */
  getConfig(): HeatmapLayerConfig | null {
    return this.config;
  }

  private buildConfig(): HeatmapLayerConfig {
    const filtered = this.rawPoints.filter(
      (p) => p.intensity >= this.threshold,
    );
    return {
      type: 'heatmap',
      points: filtered.map(toPointConfig),
      enabled: this.enabled,
      threshold: this.threshold,
    };
  }
}

/** Safely coerce unknown data to a HeatmapPoint array */
function toSafePointArray(data: unknown): HeatmapPoint[] {
  if (!data || !Array.isArray(data)) return [];
  return data as HeatmapPoint[];
}
