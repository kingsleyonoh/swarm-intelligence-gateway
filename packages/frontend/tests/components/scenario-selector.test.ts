/**
 * Tests for the ScenarioSelector component.
 * Validates DOM structure, selection behavior, launch callback, and loading state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createScenarioSelector,
  type ScenarioOption,
} from '../../src/components/scenario-selector.js';

const SAMPLE_OPTIONS: ScenarioOption[] = [
  { id: 'south-china-sea', label: 'South China Sea -- Naval Standoff', category: 'military' },
  { id: 'taiwan-strait', label: 'Taiwan Strait -- Semiconductor Crisis', category: 'market' },
  { id: 'cyber-global', label: 'Global Cyber Threat Landscape', category: 'cyber' },
  { id: 'eastern-europe', label: 'Eastern Europe -- NATO-Russia Tensions', category: 'political' },
];

describe('ScenarioSelector', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('DOM structure', () => {
    it('creates .scenario-selector root element', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      expect(container.querySelector('.scenario-selector')).not.toBeNull();
      ctrl.destroy();
    });

    it('creates a select dropdown', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.tagName).toBe('SELECT');
      ctrl.destroy();
    });

    it('creates an analyze button', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.textContent).toContain('Run Swarm Analysis');
      ctrl.destroy();
    });

    it('select has placeholder option', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      const placeholder = select.options[0];
      expect(placeholder.value).toBe('');
      expect(placeholder.textContent).toContain('Select a scenario');
      ctrl.destroy();
    });
  });

  describe('setOptions()', () => {
    it('populates dropdown with scenario options', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);

      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      // 1 placeholder + 4 scenario options
      expect(select.options.length).toBe(5);
      ctrl.destroy();
    });

    it('options have correct values and labels with category prefix', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);

      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      const opt = select.options[1]; // first real option
      expect(opt.value).toBe('south-china-sea');
      expect(opt.textContent).toContain('[MILITARY]');
      expect(opt.textContent).toContain('South China Sea');
      ctrl.destroy();
    });

    it('replaces existing options when called again', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);
      ctrl.setOptions([{ id: 'test', label: 'Test', category: 'military' }]);

      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      expect(select.options.length).toBe(2); // placeholder + 1
      ctrl.destroy();
    });
  });

  describe('button behavior', () => {
    it('button is disabled when no selection is made', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);

      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      ctrl.destroy();
    });

    it('button enables when a scenario is selected', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);

      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;

      select.value = 'south-china-sea';
      select.dispatchEvent(new Event('change'));

      expect(btn.disabled).toBe(false);
      ctrl.destroy();
    });

    it('button disables again when placeholder is re-selected', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);

      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;

      select.value = 'south-china-sea';
      select.dispatchEvent(new Event('change'));
      expect(btn.disabled).toBe(false);

      select.value = '';
      select.dispatchEvent(new Event('change'));
      expect(btn.disabled).toBe(true);
      ctrl.destroy();
    });
  });

  describe('launch callback', () => {
    it('calls onLaunch with correct templateId on click', () => {
      const onLaunch = vi.fn();
      const ctrl = createScenarioSelector(container, onLaunch);
      ctrl.setOptions(SAMPLE_OPTIONS);

      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;

      select.value = 'taiwan-strait';
      select.dispatchEvent(new Event('change'));
      btn.click();

      expect(onLaunch).toHaveBeenCalledTimes(1);
      expect(onLaunch).toHaveBeenCalledWith('taiwan-strait');
      ctrl.destroy();
    });

    it('does not call onLaunch when button is disabled', () => {
      const onLaunch = vi.fn();
      const ctrl = createScenarioSelector(container, onLaunch);
      ctrl.setOptions(SAMPLE_OPTIONS);

      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;
      btn.click();

      expect(onLaunch).not.toHaveBeenCalled();
      ctrl.destroy();
    });
  });

  describe('loading state', () => {
    it('shows loading text when setLoading(true) is called', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);

      const select = container.querySelector('.scenario-select') as HTMLSelectElement;
      select.value = 'south-china-sea';
      select.dispatchEvent(new Event('change'));

      ctrl.setLoading(true);

      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;
      expect(btn.textContent).toContain('Launching');
      expect(btn.disabled).toBe(true);
      ctrl.destroy();
    });

    it('restores button text when setLoading(false) is called', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.setOptions(SAMPLE_OPTIONS);

      ctrl.setLoading(true);
      ctrl.setLoading(false);

      const btn = container.querySelector('.analyze-btn') as HTMLButtonElement;
      expect(btn.textContent).toContain('Run Swarm Analysis');
      ctrl.destroy();
    });
  });

  describe('destroy()', () => {
    it('removes DOM elements from container', () => {
      const ctrl = createScenarioSelector(container, vi.fn());
      ctrl.destroy();

      expect(container.querySelector('.scenario-selector')).toBeNull();
    });
  });
});
