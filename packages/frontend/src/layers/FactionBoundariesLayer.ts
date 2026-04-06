/**
 * FactionBoundariesLayer — GeoJsonLayer for faction boundary overlays.
 *
 * Renders colored polygon overlays showing dominant faction stance per region.
 * Fill color = stance color at 120 alpha, line color = same at 255 alpha.
 * Processes GeoJSON data into deck.gl-compatible config without requiring WebGL.
 */

import type { MapLayer } from '../types.js';
import type {
  FactionFeature,
  FactionFeatureCollection,
  GeoJsonFeatureConfig,
  GeoJsonLayerConfig,
} from './faction-layer-types.js';
import {
  FACTION_STANCE_COLORS,
  DEFAULT_FACTION_COLOR,
} from './faction-layer-types.js';

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

/** Convert a FactionFeature to a GeoJsonFeatureConfig */
function toFeatureConfig(feature: FactionFeature): GeoJsonFeatureConfig {
  const hex =
    FACTION_STANCE_COLORS[feature.properties.stance] ??
    DEFAULT_FACTION_COLOR;
  return {
    feature,
    fillColor: hexToRgba(hex, 120),
    lineColor: hexToRgba(hex, 255),
  };
}

export class FactionBoundariesLayer implements MapLayer {
  readonly id = 'faction-boundaries';
  readonly type = 'geojson';

  private config: GeoJsonLayerConfig | null = null;

  create(data: unknown): GeoJsonLayerConfig {
    const collection = toSafeCollection(data);
    this.config = {
      type: 'geojson',
      features: collection.features.map(toFeatureConfig),
      featureCollection: collection,
    };
    return this.config;
  }

  update(data: unknown): void {
    const collection = toSafeCollection(data);
    this.config = {
      type: 'geojson',
      features: collection.features.map(toFeatureConfig),
      featureCollection: collection,
    };
  }

  destroy(): void {
    this.config = null;
  }

  /** Get current layer config (for testing and external access) */
  getConfig(): GeoJsonLayerConfig | null {
    return this.config;
  }
}

/** Safely coerce unknown data to a FactionFeatureCollection */
function toSafeCollection(data: unknown): FactionFeatureCollection {
  if (!data || typeof data !== 'object') {
    return { type: 'FeatureCollection', features: [] };
  }
  const obj = data as Record<string, unknown>;
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    return data as FactionFeatureCollection;
  }
  return { type: 'FeatureCollection', features: [] };
}
