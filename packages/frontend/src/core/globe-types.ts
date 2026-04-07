/**
 * Type definitions for the 3D globe visualization.
 * Used by GlobeRenderer and GlobeDataAdapter.
 */

/** A marker point rendered on the globe surface */
export interface GlobeMarker {
  /** Unique identifier for the marker */
  id: string;
  /** Latitude in degrees (-90 to 90) */
  lat: number;
  /** Longitude in degrees (-180 to 180) */
  lng: number;
  /** Text label shown on hover */
  label: string;
  /** CSS color string for the marker */
  color: string;
  /** Marker radius (0.0 to 1.0 scale) */
  size: number;
  /** Optional pulse animation speed multiplier */
  pulseSpeed?: number;
}

/** An arc connecting two points on the globe */
export interface GlobeArc {
  /** Start latitude */
  startLat: number;
  /** Start longitude */
  startLng: number;
  /** End latitude */
  endLat: number;
  /** End longitude */
  endLng: number;
  /** CSS color string for the arc */
  color: string;
  /** Optional stroke width */
  stroke?: number;
}
