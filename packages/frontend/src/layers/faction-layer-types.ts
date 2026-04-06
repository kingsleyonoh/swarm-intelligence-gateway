/**
 * Type definitions for FactionBoundariesLayer (GeoJsonLayer).
 * Colored polygon overlays showing dominant faction stance per region.
 */

/** GeoJSON geometry for a faction region */
export interface FactionGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

/** Properties for a single faction region feature */
export interface FactionFeatureProperties {
  /** Region/theater name */
  region: string;
  /** Dominant faction stance */
  stance: string;
  /** Dominant faction name */
  factionName: string;
  /** Stance confidence (0-1) */
  confidence: number;
}

/** A GeoJSON Feature for the faction boundaries layer */
export interface FactionFeature {
  type: 'Feature';
  geometry: FactionGeometry;
  properties: FactionFeatureProperties;
}

/** GeoJSON FeatureCollection for faction boundaries */
export interface FactionFeatureCollection {
  type: 'FeatureCollection';
  features: FactionFeature[];
}

/** Processed feature config ready for deck.gl GeoJsonLayer */
export interface GeoJsonFeatureConfig {
  feature: FactionFeature;
  fillColor: [number, number, number, number];
  lineColor: [number, number, number, number];
}

/** Layer configuration object returned by create() */
export interface GeoJsonLayerConfig {
  type: 'geojson';
  features: GeoJsonFeatureConfig[];
  featureCollection: FactionFeatureCollection;
}

/** Color mapping for faction stances: stance key -> hex color */
export const FACTION_STANCE_COLORS: Record<string, string> = {
  escalate: '#e05252',
  de_escalate: '#4a90d9',
  uncertain: '#d4a843',
  neutral: '#888888',
};

/** Default color for unknown stances */
export const DEFAULT_FACTION_COLOR = '#888888';
