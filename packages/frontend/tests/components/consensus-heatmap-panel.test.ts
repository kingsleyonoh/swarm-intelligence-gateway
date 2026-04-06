import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsensusHeatmapPanel } from '../../src/components/ConsensusHeatmapPanel.js';
import type { HeatmapPanelData } from '../../src/components/heatmap-types.js';
import { HEATMAP_SETTINGS_EVENT } from '../../src/components/heatmap-types.js';

describe('ConsensusHeatmapPanel', () => {
  let panel: ConsensusHeatmapPanel;
  let container: HTMLElement;

  beforeEach(() => {
    panel = new ConsensusHeatmapPanel();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    panel.unmount();
    container.remove();
  });

  describe('instantiation', () => {
    it('has correct id and title', () => {
      expect(panel.id).toBe('consensus-heatmap');
      expect(panel.title).toBe('Consensus Heatmap');
    });
  });

  describe('mount', () => {
    it('creates toggle button for enabling/disabling heatmap', () => {
      panel.mount(container);
      const btn = container.querySelector('.heatmap-toggle');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBeTruthy();
    });

    it('creates intensity threshold slider', () => {
      panel.mount(container);
      const slider = container.querySelector(
        '.heatmap-slider',
      ) as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(slider.type).toBe('range');
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('1');
      expect(slider.step).toBe('0.05');
    });

    it('creates color legend element', () => {
      panel.mount(container);
      const legend = container.querySelector('.heatmap-legend');
      expect(legend).not.toBeNull();
    });

    it('legend has gradient labels (Low, Medium, High)', () => {
      panel.mount(container);
      const wrapper = container.querySelector('.heatmap-legend-wrapper');
      const text = wrapper?.textContent ?? '';
      expect(text).toContain('Low');
      expect(text).toContain('High');
    });

    it('creates status text element', () => {
      panel.mount(container);
      const status = container.querySelector('.heatmap-status');
      expect(status).not.toBeNull();
    });
  });

  describe('toggle button', () => {
    it('dispatches custom event with enabled=true when toggled on', () => {
      panel.mount(container);
      const listener = vi.fn();
      container.addEventListener(HEATMAP_SETTINGS_EVENT, listener);

      const btn = container.querySelector('.heatmap-toggle') as HTMLElement;
      btn.click();

      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.enabled).toBe(true);
    });

    it('toggles between enabled and disabled on repeated clicks', () => {
      panel.mount(container);
      const listener = vi.fn();
      container.addEventListener(HEATMAP_SETTINGS_EVENT, listener);

      const btn = container.querySelector('.heatmap-toggle') as HTMLElement;
      btn.click(); // enable
      btn.click(); // disable

      expect(listener).toHaveBeenCalledTimes(2);
      const first = (listener.mock.calls[0][0] as CustomEvent).detail;
      const second = (listener.mock.calls[1][0] as CustomEvent).detail;
      expect(first.enabled).toBe(true);
      expect(second.enabled).toBe(false);
    });
  });

  describe('intensity slider', () => {
    it('dispatches event with updated threshold when slider changes', () => {
      panel.mount(container);
      const listener = vi.fn();
      container.addEventListener(HEATMAP_SETTINGS_EVENT, listener);

      const slider = container.querySelector(
        '.heatmap-slider',
      ) as HTMLInputElement;
      slider.value = '0.75';
      slider.dispatchEvent(new Event('input', { bubbles: true }));

      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.intensityThreshold).toBe(0.75);
    });

    it('displays current threshold value', () => {
      panel.mount(container);
      const slider = container.querySelector(
        '.heatmap-slider',
      ) as HTMLInputElement;
      slider.value = '0.6';
      slider.dispatchEvent(new Event('input', { bubbles: true }));

      const label = container.querySelector('.threshold-value');
      expect(label?.textContent).toContain('0.6');
    });
  });

  describe('update', () => {
    it('shows prediction count in status text', () => {
      panel.mount(container);
      const data: HeatmapPanelData = { predictionCount: 42 };
      panel.update(data);
      const status = container.querySelector('.heatmap-status');
      expect(status?.textContent).toContain('42');
      expect(status?.textContent).toContain('predictions');
    });

    it('shows zero count gracefully', () => {
      panel.mount(container);
      panel.update({ predictionCount: 0 });
      const status = container.querySelector('.heatmap-status');
      expect(status?.textContent).toContain('0');
    });
  });

  describe('unmount', () => {
    it('removes all DOM content from container', () => {
      panel.mount(container);
      panel.unmount();
      expect(container.children.length).toBe(0);
    });
  });
});
