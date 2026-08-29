import { swarmVariant } from './config/variants/swarm.js';
import { createIntelTicker } from './components/intelligence-ticker.js';
import { createScenarioSelector } from './components/scenario-selector.js';
import { createSwarmHero } from './components/swarm-hero.js';
import type { StanceSummary } from './components/swarm-hero.js';
import type { PredictionPoint } from './components/prediction-types.js';
import type { IntelligenceData } from './components/intelligence-types.js';

export function mountSimulationUi(panelContainer: HTMLElement | null) {
  const tickerContainer = document.createElement('div');
  tickerContainer.id = 'intel-ticker-mount';
  let swarmHero: ReturnType<typeof createSwarmHero> | null = null;

  if (panelContainer) {
    const heroContainer = document.createElement('div');
    heroContainer.id = 'swarm-hero-mount';
    panelContainer.parentElement?.insertBefore(heroContainer, panelContainer);
    panelContainer.parentElement?.insertBefore(tickerContainer, heroContainer);
    swarmHero = createSwarmHero(heroContainer);
  }

  const base = swarmVariant.apiBaseUrl || window.location.origin;
  const key = (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_KEY ?? '';
  let lastActiveSimId = '';

  document.addEventListener('simulation-active', ((event: Event) => {
    const detail = (event as CustomEvent<{ id: string; status: string; theater: string }>).detail;
    if (!detail || !swarmHero) return;
    if (scenarioSelector) scenarioSelector.setSimulationActive(true);

    fetch(`${base}/api/simulations/${detail.id}/progress`, {
      headers: { 'X-API-Key': key },
    })
      .then((response) => response.json())
      .then((progress: { elapsedMs?: number; status?: string; agentCount?: number }) => {
        const topic = detail.theater !== 'Simulation Theater' ? `ANALYZING: ${detail.theater}` : '';
        swarmHero?.setLive(
          progress.status ?? detail.status,
          progress.elapsedMs ?? 0,
          topic,
          detail.id,
          progress.agentCount,
        );
      })
      .catch((error) => {
        console.warn('[swarm] Simulation progress load failed:', error);
        swarmHero?.setLive(detail.status, 0, undefined, detail.id);
      });

    if (detail.id === lastActiveSimId) return;
    lastActiveSimId = detail.id;
    fetch(`${base}/api/simulations/${detail.id}`, { headers: { 'X-API-Key': key } })
      .then((response) => response.json())
      .then((simulation: { scenarioId?: string }) => {
        if (!simulation.scenarioId) return;
        return fetch(`${base}/api/scenarios/${simulation.scenarioId}`, {
          headers: { 'X-API-Key': key },
        });
      })
      .then((response) => response?.json())
      .then((scenario: { title?: string; theaters?: { label?: string }[] } | undefined) => {
        const topic = scenario?.theaters?.[0]?.label ?? scenario?.title ?? '';
        if (topic) swarmHero?.setTopic(topic);
      })
      .catch((error) => console.warn('[swarm] Scenario details load failed:', error));
  }) as EventListener);

  document.addEventListener('simulation-idle', () => {
    if (lastActiveSimId && swarmHero) {
      fetch(`${base}/api/simulations/${lastActiveSimId}/agents/summary`, {
        headers: { 'X-API-Key': key },
      })
        .then((response) => response.json())
        .then((summary: StanceSummary) => {
          swarmHero?.showRealStances(summary);
          setTimeout(() => swarmHero?.setDemo(), 10_000);
        })
        .catch((error) => {
          console.warn('[swarm] Stance summary load failed:', error);
          swarmHero?.setDemo();
        });
    } else {
      swarmHero?.setDemo();
    }
    scenarioSelector?.setSimulationActive(false);
  });

  const selectorContainer = document.createElement('div');
  selectorContainer.id = 'scenario-selector-mount';
  if (panelContainer) panelContainer.parentElement?.insertBefore(selectorContainer, panelContainer);
  const scenarioSelector = createScenarioSelector(selectorContainer, (selectedId) => {
    if (!key) {
      console.warn('[swarm] No API key — cannot launch simulation');
      scenarioSelector.setLoading(false);
      return;
    }
    scenarioSelector.setLoading(true);
    const isScenario = selectedId.startsWith('scenario:');
    const url = isScenario ? `${base}/api/simulations` : `${base}/api/simulations/launch`;
    const body = isScenario
      ? { scenarioId: selectedId.replace('scenario:', ''), agentCount: 4096, roundCount: 5 }
      : { templateId: selectedId };
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify(body),
    })
      .then((response) => response.json())
      .then((data: { simulationId?: string }) => {
        if (data.simulationId) console.info(`[swarm] Simulation launched: ${data.simulationId}`);
        setTimeout(() => scenarioSelector.setLoading(false), 3000);
      })
      .catch((error) => {
        console.error('[swarm] Launch failed:', error);
        scenarioSelector.setLoading(false);
      });
  });

  Promise.all([
    key
      ? fetch(`${base}/api/scenarios?limit=1`, { headers: { 'X-API-Key': key } })
          .then((response) => response.json()).catch((error) => {
            console.warn('[swarm] Scenario list load failed:', error);
            return { data: [] };
          })
      : Promise.resolve({ data: [] }),
    fetch(`${base}/api/scenarios/templates`)
      .then((response) => response.json()).catch((error) => {
        console.warn('[swarm] Template list load failed:', error);
        return { templates: [] };
      }),
  ]).then(([scenarioResponse, templateResponse]) => {
    const options: Array<{ id: string; label: string; category: string }> = [];
    const scenarios = (scenarioResponse as { data?: Array<{ id: string; title: string }> }).data ?? [];
    if (scenarios.length > 0) {
      options.push({ id: `scenario:${scenarios[0].id}`, label: `LATEST: ${scenarios[0].title}`, category: 'live' });
    }
    const templates = (templateResponse as { templates?: Array<{ id: string; label: string; category: string }> }).templates ?? [];
    options.push(...templates);
    scenarioSelector.setOptions(options);
  });

  return createIntelTicker(tickerContainer);
}

export function wireGlobeUpdates(
  globeContainer: HTMLElement,
): void {
  let pendingPredictions: PredictionPoint[] | null = null;
  document.addEventListener('predictions-updated', ((event: Event) => {
    pendingPredictions = (event as CustomEvent<PredictionPoint[]>).detail;
  }) as EventListener);

  import('./core/globe-renderer.js').then(async ({ GlobeRenderer }) => {
    const { predictionsToMarkers, forecastsToMarkers } = await import('./core/globe-data-adapter.js');
    const renderer = new GlobeRenderer(globeContainer);
    try {
      await renderer.init();
      if (pendingPredictions && pendingPredictions.length > 0) {
        renderer.updateMarkers(predictionsToMarkers(pendingPredictions));
      }
      document.addEventListener('predictions-updated', ((event: Event) => {
        const detail = (event as CustomEvent<PredictionPoint[]>).detail;
        if (detail) renderer.updateMarkers(predictionsToMarkers(detail));
      }) as EventListener);
      document.addEventListener('intelligence-updated', ((event: Event) => {
        const intelligence = (event as CustomEvent<IntelligenceData>).detail;
        if (intelligence?.forecasts) renderer.updateNewsMarkers(forecastsToMarkers(intelligence.forecasts));
      }) as EventListener);
      document.addEventListener('heatmap-settings-change', ((event: Event) => {
        const settings = (event as CustomEvent<{ enabled: boolean; intensityThreshold: number }>).detail;
        if (settings) renderer.setHeatmapMode(settings.enabled, settings.intensityThreshold);
      }) as EventListener);
    } catch (error) {
      console.warn('[swarm] Globe init failed (WebGL may not be available):', error);
    }
  }).catch((error) => console.warn('[swarm] Globe module load failed:', error));
}
