/**
 * Data types for the ConsensusHeatmapPanel controls.
 * The panel is a controls UI; the actual heatmap layer renders on the globe.
 */

/** Heatmap settings dispatched when the user changes controls */
export interface HeatmapSettings {
  enabled: boolean;
  intensityThreshold: number;
}

/** Custom event name for heatmap setting changes */
export const HEATMAP_SETTINGS_EVENT = 'heatmap-settings-change';

/** Data passed to the panel update() method */
export interface HeatmapPanelData {
  predictionCount: number;
}
