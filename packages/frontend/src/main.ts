/**
 * Swarm Intelligence Gateway — Frontend Entry Point
 *
 * Boot sequence (inspired by WorldMonitor's 8-phase pattern):
 *  1. Initialize registries (panel + layer)
 *  2. Register available panels and layers
 *  3. Load variant config
 *  4. Resolve panels and layers via VariantLoader
 *  5. Mount panels into the panel container
 *  6. Initialize globe/map (future)
 *  7. Start polling loops (future)
 *  8. Ready
 *
 * Panels and layers are registered here. Their implementations will be
 * added in later batches (Phase 4 panels: batch-019+).
 */

import { PanelRegistry } from './core/panel-registry.js';
import { LayerRegistry } from './core/layer-registry.js';
import { VariantLoader } from './core/variant-loader.js';
import { swarmVariant } from './config/variants/swarm.js';
import { SwarmTheaterPanel } from './components/SwarmTheaterPanel.js';
import { FactionMapPanel } from './components/FactionMapPanel.js';
import { PredictionTimelinePanel } from './components/PredictionTimelinePanel.js';
import { ConsensusHeatmapPanel } from './components/ConsensusHeatmapPanel.js';
import { SwarmPredictionsLayer } from './layers/SwarmPredictionsLayer.js';
import { FactionBoundariesLayer } from './layers/FactionBoundariesLayer.js';
import { ConsensusHeatLayer } from './layers/ConsensusHeatLayer.js';
import { DataBridge } from './api/data-bridge.js';
import { loadDemoData } from './api/demo-loader.js';
import type { Panel, MapLayerConstructor } from './types.js';

// Phase 1: Initialize registries
const panelRegistry = new PanelRegistry();
const layerRegistry = new LayerRegistry();
const variantLoader = new VariantLoader(panelRegistry, layerRegistry);

// Phase 2: Register panels and layers
panelRegistry.register('swarm-theater', SwarmTheaterPanel);
panelRegistry.register('faction-map', FactionMapPanel);
panelRegistry.register('prediction-timeline', PredictionTimelinePanel);
panelRegistry.register('consensus-heatmap', ConsensusHeatmapPanel);

layerRegistry.register(
  'swarm-predictions',
  SwarmPredictionsLayer as unknown as MapLayerConstructor,
);
layerRegistry.register(
  'faction-boundaries',
  FactionBoundariesLayer as unknown as MapLayerConstructor,
);
layerRegistry.register(
  'consensus-heat',
  ConsensusHeatLayer as unknown as MapLayerConstructor,
);

// Phase 3-4: Load variant config and resolve
const { panels, layers } = variantLoader.load(swarmVariant);

// Phase 5: Mount panels into the panel container
const panelContainer = document.getElementById('panel-container');
if (panelContainer) {
  for (const panel of panels) {
    const section = document.createElement('section');
    section.classList.add('panel');
    section.dataset.panelId = panel.id;

    const header = document.createElement('h2');
    header.textContent = panel.title;
    section.appendChild(header);

    const content = document.createElement('div');
    content.classList.add('panel-content');
    section.appendChild(content);

    panel.mount(content);
    panelContainer.appendChild(section);
  }
}

// Phase 6: Globe initialization will be wired in later batches

// Phase 7: Start polling loops via DataBridge
const mountedPanels = new Map<string, Panel>();
for (const panel of panels) {
  mountedPanels.set(panel.id, panel);
}

// Detect demo mode: explicit env var OR no API key configured (dev default)
const viteEnv = (import.meta as unknown as Record<string, Record<string, string>>).env ?? {};
const apiKey = viteEnv.VITE_API_KEY ?? '';
const isDemoMode = viteEnv.VITE_DEMO_MODE === 'true' || !apiKey;

let dataBridge: DataBridge | null = null;

if (isDemoMode) {
  // Load demo data from static JSON files and feed to panels
  loadDemoData(mountedPanels).catch((err) =>
    console.warn('[swarm] Demo data load failed:', err),
  );
} else {
  dataBridge = new DataBridge({
    apiBaseUrl: swarmVariant.apiBaseUrl || window.location.origin,
    apiKey,
    refreshIntervals: swarmVariant.refreshIntervals,
    panels: mountedPanels,
  });
  dataBridge.startAll();
}

// Phase 8: Ready
console.info(
  `[swarm] Boot complete. Variant: ${swarmVariant.name}. ` +
    `Panels: ${panels.length}, Layers: ${layers.length}, Demo: ${isDemoMode}`,
);

// Export for testing/debugging
export { panelRegistry, layerRegistry, variantLoader, dataBridge, isDemoMode };
