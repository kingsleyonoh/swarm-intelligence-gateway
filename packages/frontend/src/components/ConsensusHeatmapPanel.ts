/**
 * ConsensusHeatmapPanel — Controls panel for deck.gl HeatmapLayer on globe.
 *
 * UI elements:
 *  - Toggle button: enable/disable heatmap layer
 *  - Intensity threshold slider: 0-1, step 0.05
 *  - Color legend: gradient bar green-yellow-red
 *  - Status text: "N predictions mapped" count
 *
 * Dispatches custom events when settings change so the globe layer can react.
 * The actual heatmap rendering is in a separate MapLayer (next batch).
 */

import type { Panel } from '../types.js';
import type { HeatmapPanelData, HeatmapSettings } from './heatmap-types.js';
import { HEATMAP_SETTINGS_EVENT } from './heatmap-types.js';

export class ConsensusHeatmapPanel implements Panel {
  readonly id = 'consensus-heatmap';
  readonly title = 'Consensus Heatmap';

  private container: HTMLElement | null = null;
  private enabled = false;
  private threshold = 0.5;
  private thresholdLabel: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    container.appendChild(this.buildToggle());
    container.appendChild(this.buildSlider());
    container.appendChild(this.buildLegend());
    this.statusEl = this.buildStatus();
    container.appendChild(this.statusEl);
  }

  unmount(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.thresholdLabel = null;
    this.statusEl = null;
    this.enabled = false;
    this.threshold = 0.5;
  }

  update(data: unknown): void {
    if (!this.statusEl) return;
    const d = data as HeatmapPanelData;
    if (typeof d.predictionCount !== 'number') return;
    this.statusEl.textContent = `${d.predictionCount} predictions mapped`;
  }

  private buildToggle(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'heatmap-toggle';
    btn.textContent = 'Enable Heatmap';
    btn.addEventListener('click', () => {
      this.enabled = !this.enabled;
      btn.textContent = this.enabled
        ? 'Disable Heatmap'
        : 'Enable Heatmap';
      this.dispatchSettings();
    });
    return btn;
  }

  private buildSlider(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'heatmap-slider-wrapper';

    const label = document.createElement('label');
    label.textContent = 'Intensity Threshold: ';
    wrapper.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'heatmap-slider';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String(this.threshold);
    wrapper.appendChild(slider);

    this.thresholdLabel = document.createElement('span');
    this.thresholdLabel.className = 'heatmap-threshold-value';
    this.thresholdLabel.textContent = String(this.threshold);
    wrapper.appendChild(this.thresholdLabel);

    slider.addEventListener('input', () => {
      this.threshold = parseFloat(slider.value);
      if (this.thresholdLabel) {
        this.thresholdLabel.textContent = String(this.threshold);
      }
      this.dispatchSettings();
    });

    return wrapper;
  }

  private buildLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.className = 'heatmap-legend';

    const bar = document.createElement('div');
    bar.className = 'heatmap-legend-bar';
    bar.style.height = '12px';
    bar.style.background =
      'linear-gradient(to right, #27ae60, #f1c40f, #e74c3c)';
    bar.style.borderRadius = '4px';
    legend.appendChild(bar);

    const labels = document.createElement('div');
    labels.className = 'heatmap-legend-labels';
    labels.style.display = 'flex';
    labels.style.justifyContent = 'space-between';

    const low = document.createElement('span');
    low.textContent = 'Low';
    labels.appendChild(low);

    const mid = document.createElement('span');
    mid.textContent = 'Medium';
    labels.appendChild(mid);

    const high = document.createElement('span');
    high.textContent = 'High';
    labels.appendChild(high);

    legend.appendChild(labels);
    return legend;
  }

  private buildStatus(): HTMLElement {
    const status = document.createElement('div');
    status.className = 'heatmap-status';
    status.textContent = '0 predictions mapped';
    return status;
  }

  private dispatchSettings(): void {
    if (!this.container) return;
    const settings: HeatmapSettings = {
      enabled: this.enabled,
      intensityThreshold: this.threshold,
    };
    this.container.dispatchEvent(
      new CustomEvent(HEATMAP_SETTINGS_EVENT, {
        detail: settings,
        bubbles: true,
      }),
    );
  }
}
