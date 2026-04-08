import type { VariantConfig } from '../../types.js';

/**
 * Swarm Intelligence variant configuration.
 *
 * Defines the panel set, map layer order, refresh intervals, and API
 * settings for the "swarm" variant of the WorldMonitor-inspired frontend.
 *
 * Panels:
 *  1. SwarmTheaterPanel (hero) — theater cards, confidence gauges, faction bars
 *  2. FactionMapPanel — D3 force-directed faction graph
 *  3. PredictionTimelinePanel — D3 SVG confidence timeline
 *  (ConsensusHeatmapPanel removed — didn't communicate value)
 *
 * Layers:
 *  1. factionBoundaries — GeoJsonLayer (rendered first, below)
 *  2. swarmPredictions — ScatterplotLayer (prediction markers)
 *  3. consensusHeat — HeatmapLayer (hidden by default, toggled via panel)
 */
export const swarmVariant: VariantConfig = {
  id: 'swarm',
  name: 'Swarm Intelligence',

  panels: [
    {
      id: 'swarm-theater',
      order: 10,
      expanded: true,
    },
    {
      id: 'faction-map',
      order: 20,
      expanded: false,
    },
    {
      id: 'prediction-timeline',
      order: 30,
      expanded: false,
    },
  ],

  layers: [
    {
      id: 'faction-boundaries',
      visible: true,
      order: 10,
    },
    {
      id: 'swarm-predictions',
      visible: true,
      order: 20,
    },
    {
      id: 'consensus-heat',
      visible: false,
      order: 30,
    },
  ],

  refreshIntervals: {
    simulations: 10_000,
    predictions: 60_000,
    factions: 60_000,
    heatmap: 120_000,
  },

  apiBaseUrl: '',
};
