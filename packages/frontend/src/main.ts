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
import type { PredictionPoint } from './components/prediction-types.js';

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

// Panel descriptions for user context
const PANEL_DESCRIPTIONS: Record<string, string> = {
  'swarm-theater': 'Active simulation theaters. Each card shows a region being analyzed by 4,096 AI agents. Click a card for agent debate details.',
  'faction-map': 'How factions relate to each other. Node size = influence, color = stance (red = escalation, blue = de-escalation, yellow = uncertain).',
  'prediction-timeline': 'Prediction confidence over time. Each dot is a prediction colored by type. Lines connect predictions for the same theater.',
  'consensus-heatmap': 'Controls for the globe heatmap overlay. Adjust intensity threshold to filter predictions by confidence level.',
};

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

    const desc = PANEL_DESCRIPTIONS[panel.id];
    if (desc) {
      const subtitle = document.createElement('p');
      subtitle.className = 'panel-description';
      subtitle.textContent = desc;
      section.appendChild(subtitle);
    }

    const content = document.createElement('div');
    content.classList.add('panel-content');
    section.appendChild(content);

    panel.mount(content);
    panelContainer.appendChild(section);
  }
}

// Phase 6: Initialize Globe
const globeContainer = document.getElementById('globe-container');
if (globeContainer) {
  // Buffer prediction events that arrive before globe is ready
  let pendingPredictions: PredictionPoint[] | null = null;
  document.addEventListener('predictions-updated', ((e: Event) => {
    pendingPredictions = (e as CustomEvent<PredictionPoint[]>).detail;
  }) as EventListener);

  import('./core/globe-renderer.js').then(async ({ GlobeRenderer }) => {
    const { predictionsToMarkers } = await import('./core/globe-data-adapter.js');
    const renderer = new GlobeRenderer(globeContainer);
    try {
      await renderer.init();

      // Replay any predictions that arrived during init
      if (pendingPredictions && pendingPredictions.length > 0) {
        renderer.updateMarkers(predictionsToMarkers(pendingPredictions));
      }

      // Listen for future prediction updates
      document.addEventListener('predictions-updated', ((e: Event) => {
        const detail = (e as CustomEvent<PredictionPoint[]>).detail;
        if (detail) {
          renderer.updateMarkers(predictionsToMarkers(detail));
        }
      }) as EventListener);
    } catch (err) {
      console.warn('[swarm] Globe init failed (WebGL may not be available):', err);
    }
  }).catch((err) => {
    console.warn('[swarm] Globe module load failed:', err);
  });
}

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
  const apiBaseUrl = swarmVariant.apiBaseUrl || window.location.origin;

  // Pass API config to SwarmTheaterPanel for on-demand report fetching
  const theaterPanel = mountedPanels.get('swarm-theater');
  if (theaterPanel && 'setApiConfig' in theaterPanel) {
    (theaterPanel as SwarmTheaterPanel).setApiConfig({ apiKey, apiBaseUrl });
  }

  dataBridge = new DataBridge({
    apiBaseUrl,
    apiKey,
    refreshIntervals: swarmVariant.refreshIntervals,
    panels: mountedPanels,
  });
  dataBridge.startAll();
}

// Phase 8: Ready
const modeBadge = document.getElementById('mode-badge');
if (modeBadge) {
  modeBadge.textContent = isDemoMode ? 'Demo' : 'Live';
  if (!isDemoMode) modeBadge.style.borderColor = 'var(--accent)';
}

console.info(
  `[swarm] Boot complete. Variant: ${swarmVariant.name}. ` +
    `Panels: ${panels.length}, Layers: ${layers.length}, Demo: ${isDemoMode}`,
);

// Export for testing/debugging
export { panelRegistry, layerRegistry, variantLoader, dataBridge, isDemoMode };
