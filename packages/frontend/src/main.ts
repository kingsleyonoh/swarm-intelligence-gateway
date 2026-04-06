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

// Phase 1: Initialize registries
const panelRegistry = new PanelRegistry();
const layerRegistry = new LayerRegistry();
const variantLoader = new VariantLoader(panelRegistry, layerRegistry);

// Phase 2: Register panels and layers
panelRegistry.register('swarm-theater', SwarmTheaterPanel);
panelRegistry.register('faction-map', FactionMapPanel);

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

// Phase 6-7: Globe and polling loops will be wired in later batches

// Phase 8: Ready
console.info(
  `[swarm] Boot complete. Variant: ${swarmVariant.name}. ` +
    `Panels: ${panels.length}, Layers: ${layers.length}`,
);

// Export for testing/debugging
export { panelRegistry, layerRegistry, variantLoader };
