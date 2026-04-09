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
// ConsensusHeatmapPanel removed — didn't communicate value
import { SwarmPredictionsLayer } from './layers/SwarmPredictionsLayer.js';
import { FactionBoundariesLayer } from './layers/FactionBoundariesLayer.js';
import { ConsensusHeatLayer } from './layers/ConsensusHeatLayer.js';
import { DataBridge } from './api/data-bridge.js';
import { loadDemoData } from './api/demo-loader.js';
import { createIntelTicker } from './components/intelligence-ticker.js';
import { createScenarioSelector } from './components/scenario-selector.js';
import type { Panel, MapLayerConstructor } from './types.js';
import type { PredictionPoint } from './components/prediction-types.js';
import type { IntelligenceData } from './components/intelligence-types.js';
import type { StanceSummary } from './components/swarm-hero.js';

// Phase 1: Initialize registries
const panelRegistry = new PanelRegistry();
const layerRegistry = new LayerRegistry();
const variantLoader = new VariantLoader(panelRegistry, layerRegistry);

// Phase 2: Register panels and layers
panelRegistry.register('swarm-theater', SwarmTheaterPanel);
panelRegistry.register('faction-map', FactionMapPanel);
panelRegistry.register('prediction-timeline', PredictionTimelinePanel);
// panelRegistry.register('consensus-heatmap', ConsensusHeatmapPanel);

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
  'swarm-theater': 'Swarm intelligence predictions by theater. Each card shows what 4,096 AI agents predict will happen next. Click for the full intelligence brief.',
  'faction-map': 'How factions relate to each other. Node size = influence, color = stance (red = escalation, blue = de-escalation, yellow = uncertain).',
  'prediction-timeline': 'Prediction confidence over time. Each dot is a prediction colored by type. Lines connect predictions for the same theater.',
};

// Phase 5a: Mount swarm hero visualization (always-visible demo loop)
import { createSwarmHero } from './components/swarm-hero.js';
const panelContainer = document.getElementById('panel-container');

// Mount intelligence ticker between globe and hero
const tickerContainer = document.createElement('div');
tickerContainer.id = 'intel-ticker-mount';
let swarmHero: ReturnType<typeof createSwarmHero> | null = null;
if (panelContainer) {
  const heroContainer = document.createElement('div');
  heroContainer.id = 'swarm-hero-mount';
  panelContainer.parentElement?.insertBefore(heroContainer, panelContainer);
  panelContainer.parentElement?.insertBefore(tickerContainer, heroContainer);
  swarmHero = createSwarmHero(heroContainer);

  // Wire swarm hero to real simulation status
  let lastActiveSimId = '';
  document.addEventListener('simulation-active', ((e: Event) => {
    const detail = (e as CustomEvent<{ id: string; status: string; theater: string }>).detail;
    scenarioSelector.setSimulationActive(true);
    if (detail && swarmHero) {
      const base = swarmVariant.apiBaseUrl || window.location.origin;
      const key = (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_KEY ?? '';
      // Fetch progress for elapsed time
      fetch(`${base}/api/simulations/${detail.id}/progress`, {
        headers: { 'X-API-Key': key },
      }).then((r) => r.json()).then((prog: { elapsedMs?: number; status?: string }) => {
        const topic = detail.theater !== 'Simulation Theater' ? `ANALYZING: ${detail.theater}` : '';
        swarmHero?.setLive(prog.status ?? detail.status, prog.elapsedMs ?? 0, topic, detail.id);
      }).catch(() => {
        swarmHero?.setLive(detail.status, 0, undefined, detail.id);
      });
      // Fetch scenario title once per simulation
      if (detail.id !== lastActiveSimId) {
        lastActiveSimId = detail.id;
        fetch(`${base}/api/simulations/${detail.id}`, {
          headers: { 'X-API-Key': key },
        }).then((r) => r.json()).then((sim: { scenarioId?: string }) => {
          if (sim.scenarioId) {
            fetch(`${base}/api/scenarios/${sim.scenarioId}`, {
              headers: { 'X-API-Key': key },
            }).then((r2) => r2.json()).then((scenario: { title?: string; theaters?: { label?: string }[] }) => {
              // Use first theater label (more descriptive) or fall back to title
              const topTheater = scenario.theaters?.[0]?.label;
              const topic = topTheater ?? scenario.title ?? '';
              if (topic) swarmHero?.setTopic(topic);
            }).catch(() => { /* ignore */ });
          }
        }).catch(() => { /* ignore */ });
      }
    }
  }) as EventListener);

  document.addEventListener('simulation-idle', () => {
    // If we had an active simulation, fetch its stance summary before demo
    if (lastActiveSimId && swarmHero) {
      const base = swarmVariant.apiBaseUrl || window.location.origin;
      const key = (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_KEY ?? '';
      fetch(`${base}/api/simulations/${lastActiveSimId}/agents/summary`, {
        headers: { 'X-API-Key': key },
      })
        .then((r) => r.json())
        .then((summary: StanceSummary) => {
          swarmHero?.showRealStances(summary);
          // Switch to demo after showing real stances (10s)
          setTimeout(() => {
            swarmHero?.setDemo();
          }, 10_000);
        })
        .catch(() => {
          swarmHero?.setDemo();
        });
    } else {
      swarmHero?.setDemo();
    }
    scenarioSelector.setSimulationActive(false);
  });
}
const intelTicker = createIntelTicker(tickerContainer);

// Phase 5a-2: Mount scenario selector above panels
const selectorContainer = document.createElement('div');
selectorContainer.id = 'scenario-selector-mount';
if (panelContainer) {
  panelContainer.parentElement?.insertBefore(selectorContainer, panelContainer);
}
const scenarioSelector = createScenarioSelector(selectorContainer, (selectedId) => {
  const base = swarmVariant.apiBaseUrl || window.location.origin;
  const key = (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_KEY ?? '';
  if (!key) {
    console.warn('[swarm] No API key — cannot launch simulation');
    scenarioSelector.setLoading(false);
    return;
  }
  scenarioSelector.setLoading(true);

  // Check if this is a real scenario (scenario:UUID) or a template
  const isRealScenario = selectedId.startsWith('scenario:');
  const url = isRealScenario
    ? `${base}/api/simulations`
    : `${base}/api/simulations/launch`;
  const body = isRealScenario
    ? { scenarioId: selectedId.replace('scenario:', ''), agentCount: 4096, roundCount: 5 }
    : { templateId: selectedId };

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .then((data: { simulationId?: string }) => {
      if (data.simulationId) {
        console.info(`[swarm] Simulation launched: ${data.simulationId}`);
      }
      setTimeout(() => scenarioSelector.setLoading(false), 3000);
    })
    .catch((err) => {
      console.error('[swarm] Launch failed:', err);
      scenarioSelector.setLoading(false);
    });
});

// Load latest WorldMonitor scenario + pre-built templates
const templateBaseUrl = swarmVariant.apiBaseUrl || window.location.origin;
const viteApiKey = (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_KEY ?? '';

Promise.all([
  // Fetch latest real scenario from WorldMonitor
  viteApiKey
    ? fetch(`${templateBaseUrl}/api/scenarios?limit=1`, {
        headers: { 'X-API-Key': viteApiKey },
      }).then((r) => r.json()).catch(() => ({ data: [] }))
    : Promise.resolve({ data: [] }),
  // Fetch pre-built templates
  fetch(`${templateBaseUrl}/api/scenarios/templates`)
    .then((r) => r.json()).catch(() => ({ templates: [] })),
]).then(([scenarioResp, templateResp]) => {
  const options: Array<{ id: string; label: string; category: string }> = [];

  // Add latest WorldMonitor scenario as primary option
  const scenarios = (scenarioResp as { data?: Array<{ id: string; title: string }> }).data ?? [];
  if (scenarios.length > 0) {
    options.push({
      id: `scenario:${scenarios[0].id}`,
      label: `LATEST: ${scenarios[0].title}`,
      category: 'live',
    });
  }

  // Add pre-built templates
  const templates = (templateResp as { templates?: Array<{ id: string; label: string; category: string }> }).templates ?? [];
  for (const t of templates) options.push(t);

  scenarioSelector.setOptions(options);
});

// Phase 5b: Mount panels into the panel container
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
    const { predictionsToMarkers, forecastsToMarkers } = await import('./core/globe-data-adapter.js');
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

      // Listen for intelligence updates → news markers on globe
      document.addEventListener('intelligence-updated', ((e: Event) => {
        const intel = (e as CustomEvent<IntelligenceData>).detail;
        if (intel?.forecasts) {
          renderer.updateNewsMarkers(forecastsToMarkers(intel.forecasts));
        }
      }) as EventListener);

      // Listen for heatmap toggle from ConsensusHeatmapPanel
      document.addEventListener('heatmap-settings-change', ((e: Event) => {
        const settings = (e as CustomEvent<{ enabled: boolean; intensityThreshold: number }>).detail;
        if (settings) {
          renderer.setHeatmapMode(settings.enabled, settings.intensityThreshold);
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
    tickerController: intelTicker,
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
