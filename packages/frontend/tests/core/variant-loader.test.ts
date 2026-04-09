import { describe, it, expect, beforeEach } from 'vitest';

import { VariantLoader } from '../../src/core/variant-loader.js';
import { PanelRegistry } from '../../src/core/panel-registry.js';
import { LayerRegistry } from '../../src/core/layer-registry.js';
import { swarmVariant } from '../../src/config/variants/swarm.js';
import type {
  Panel,
  PanelConstructor,
  MapLayer,
  MapLayerConstructor,
  VariantConfig,
} from '../../src/types.js';

/** Stub panels matching swarm variant panel IDs */
class SwarmTheaterPanel implements Panel {
  readonly id = 'swarm-theater';
  readonly title = 'Swarm Theater';
  mount(_c: HTMLElement): void { /* stub */ }
  unmount(): void { /* stub */ }
  update(_d: unknown): void { /* stub */ }
}

class FactionMapPanel implements Panel {
  readonly id = 'faction-map';
  readonly title = 'Faction Map';
  mount(_c: HTMLElement): void { /* stub */ }
  unmount(): void { /* stub */ }
  update(_d: unknown): void { /* stub */ }
}

class PredictionTimelinePanel implements Panel {
  readonly id = 'prediction-timeline';
  readonly title = 'Prediction Timeline';
  mount(_c: HTMLElement): void { /* stub */ }
  unmount(): void { /* stub */ }
  update(_d: unknown): void { /* stub */ }
}

class ConsensusHeatmapPanel implements Panel {
  readonly id = 'consensus-heatmap';
  readonly title = 'Consensus Heatmap';
  mount(_c: HTMLElement): void { /* stub */ }
  unmount(): void { /* stub */ }
  update(_d: unknown): void { /* stub */ }
}

/** Stub layers matching swarm variant layer IDs */
class SwarmPredictionsLayer implements MapLayer {
  readonly id = 'swarm-predictions';
  readonly type = 'scatterplot';
  create(_d: unknown): unknown { return null; }
  update(_d: unknown): void { /* stub */ }
  destroy(): void { /* stub */ }
}

class FactionBoundariesLayer implements MapLayer {
  readonly id = 'faction-boundaries';
  readonly type = 'geojson';
  create(_d: unknown): unknown { return null; }
  update(_d: unknown): void { /* stub */ }
  destroy(): void { /* stub */ }
}

class ConsensusHeatLayer implements MapLayer {
  readonly id = 'consensus-heat';
  readonly type = 'heatmap';
  create(_d: unknown): unknown { return null; }
  update(_d: unknown): void { /* stub */ }
  destroy(): void { /* stub */ }
}

describe('VariantLoader', () => {
  let panelRegistry: PanelRegistry;
  let layerRegistry: LayerRegistry;
  let loader: VariantLoader;

  beforeEach(() => {
    panelRegistry = new PanelRegistry();
    layerRegistry = new LayerRegistry();
    loader = new VariantLoader(panelRegistry, layerRegistry);

    // Register all stub constructors
    panelRegistry.register('swarm-theater', SwarmTheaterPanel as PanelConstructor);
    panelRegistry.register('faction-map', FactionMapPanel as PanelConstructor);
    panelRegistry.register('prediction-timeline', PredictionTimelinePanel as PanelConstructor);
    panelRegistry.register('consensus-heatmap', ConsensusHeatmapPanel as PanelConstructor);

    layerRegistry.register('swarm-predictions', SwarmPredictionsLayer as MapLayerConstructor);
    layerRegistry.register('faction-boundaries', FactionBoundariesLayer as MapLayerConstructor);
    layerRegistry.register('consensus-heat', ConsensusHeatLayer as MapLayerConstructor);
  });

  it('loads a variant config and returns resolved panels', () => {
    const result = loader.load(swarmVariant);
    expect(result.panels).toHaveLength(3);
    expect(result.panels[0].id).toBe('swarm-theater');
    expect(result.panels[1].id).toBe('prediction-timeline');
    expect(result.panels[2].id).toBe('faction-map');
  });

  it('loads a variant config and returns resolved layers', () => {
    const result = loader.load(swarmVariant);
    expect(result.layers).toHaveLength(3);

    const layerIds = result.layers.map((l) => l.id);
    expect(layerIds).toContain('swarm-predictions');
    expect(layerIds).toContain('faction-boundaries');
    expect(layerIds).toContain('consensus-heat');
  });

  it('preserves panel order from variant config', () => {
    const result = loader.load(swarmVariant);
    const ids = result.panels.map((p) => p.id);
    expect(ids).toEqual([
      'swarm-theater',
      'prediction-timeline',
      'faction-map',
    ]);
  });

  it('preserves layer order from variant config', () => {
    const result = loader.load(swarmVariant);
    const ids = result.layers.map((l) => l.id);
    // layers sorted by config order
    expect(ids).toEqual([
      'faction-boundaries',
      'swarm-predictions',
      'consensus-heat',
    ]);
  });

  it('stores the loaded config', () => {
    loader.load(swarmVariant);
    expect(loader.getConfig()).toBe(swarmVariant);
  });

  it('skips panels not registered in registry', () => {
    panelRegistry.unregister('faction-map');
    const result = loader.load(swarmVariant);
    expect(result.panels).toHaveLength(2);
    const ids = result.panels.map((p) => p.id);
    expect(ids).not.toContain('faction-map');
  });

  it('skips layers not registered in registry', () => {
    layerRegistry.unregister('consensus-heat');
    const result = loader.load(swarmVariant);
    expect(result.layers).toHaveLength(2);
    const ids = result.layers.map((l) => l.id);
    expect(ids).not.toContain('consensus-heat');
  });

  it('returns empty arrays for variant with no matching registrations', () => {
    panelRegistry.clear();
    layerRegistry.clear();
    const result = loader.load(swarmVariant);
    expect(result.panels).toEqual([]);
    expect(result.layers).toEqual([]);
  });

  it('exposes refresh intervals from loaded config', () => {
    loader.load(swarmVariant);
    const intervals = loader.getRefreshIntervals();
    expect(intervals).toBeDefined();
    expect(intervals!.simulations).toBe(10_000);
    expect(intervals!.predictions).toBe(60_000);
  });

  it('returns undefined refresh intervals before loading', () => {
    expect(loader.getRefreshIntervals()).toBeUndefined();
  });

  it('throws on loading a variant with empty id', () => {
    const bad: VariantConfig = {
      ...swarmVariant,
      id: '',
    };
    expect(() => loader.load(bad)).toThrow('Variant config must have a non-empty id');
  });
});
