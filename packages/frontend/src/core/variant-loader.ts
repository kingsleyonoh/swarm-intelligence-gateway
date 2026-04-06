import type { Panel, MapLayer, VariantConfig, RefreshIntervals } from '../types.js';
import type { PanelRegistry } from './panel-registry.js';
import type { LayerRegistry } from './layer-registry.js';

/** Result of loading a variant config */
export interface LoadResult {
  /** Panel instances in config-defined order */
  panels: Panel[];
  /** Layer instances in config-defined render order */
  layers: MapLayer[];
}

/**
 * Variant loader — resolves a VariantConfig into live panel and layer instances.
 *
 * Follows WorldMonitor's boot sequence pattern:
 *  1. Read variant config (panels + layers)
 *  2. For each panel/layer ID, look up the constructor in the registry
 *  3. Instantiate and return ordered arrays
 *  4. Skip IDs that have no registered constructor (graceful degradation)
 */
export class VariantLoader {
  private config: VariantConfig | undefined;

  constructor(
    private readonly panelRegistry: PanelRegistry,
    private readonly layerRegistry: LayerRegistry,
  ) {}

  /**
   * Load a variant config, resolving panel and layer instances.
   * Panels are ordered by config `order`. Layers are ordered by config `order`.
   * Unregistered IDs are skipped silently.
   */
  load(config: VariantConfig): LoadResult {
    if (!config.id) {
      throw new Error('Variant config must have a non-empty id');
    }

    this.config = config;

    // Resolve panels in config order
    const sortedPanelConfigs = [...config.panels].sort(
      (a, b) => a.order - b.order,
    );
    const panels: Panel[] = [];
    for (const pc of sortedPanelConfigs) {
      const panel = this.panelRegistry.create(pc.id);
      if (panel) {
        panels.push(panel);
      }
    }

    // Resolve layers in config render order
    const sortedLayerConfigs = [...config.layers].sort(
      (a, b) => a.order - b.order,
    );
    const layers: MapLayer[] = [];
    for (const lc of sortedLayerConfigs) {
      const layer = this.layerRegistry.create(lc.id);
      if (layer) {
        layers.push(layer);
      }
    }

    return { panels, layers };
  }

  /** Get the currently loaded variant config, or undefined if not loaded. */
  getConfig(): VariantConfig | undefined {
    return this.config;
  }

  /** Get refresh intervals from the loaded config, or undefined if not loaded. */
  getRefreshIntervals(): RefreshIntervals | undefined {
    return this.config?.refreshIntervals;
  }
}
