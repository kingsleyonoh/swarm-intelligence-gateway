/**
 * Tests for the IntelligenceTicker component.
 * Validates DOM structure, update behavior, severity dots, and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIntelTicker } from '../../src/components/intelligence-ticker.js';
import type { IntelligenceData } from '../../src/components/intelligence-types.js';

function makeIntelData(overrides: Partial<IntelligenceData> = {}): IntelligenceData {
  return {
    stories: [
      { title: 'Iran infrastructure fragility feeds inflation pressure', link: 'https://example.com/1', severity: 'critical', currentScore: 90 },
      { title: 'Baltic Sea patrol activity increases', link: 'https://example.com/2', severity: 'warning', currentScore: 65 },
      { title: 'Sahel drought monitoring update', link: 'https://example.com/3', severity: 'info', currentScore: 30 },
    ],
    forecasts: [],
    fetchedAt: '2026-04-07T12:00:00Z',
    ...overrides,
  };
}

describe('IntelligenceTicker', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('DOM structure', () => {
    it('creates .intel-ticker root element', () => {
      const ticker = createIntelTicker(container);
      expect(container.querySelector('.intel-ticker')).not.toBeNull();
      ticker.destroy();
    });

    it('has LIVE INTELLIGENCE label', () => {
      const ticker = createIntelTicker(container);
      const label = container.querySelector('.intel-ticker-label');
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe('LIVE INTELLIGENCE');
      ticker.destroy();
    });

    it('has ticker track and scroll containers', () => {
      const ticker = createIntelTicker(container);
      expect(container.querySelector('.intel-ticker-track')).not.toBeNull();
      expect(container.querySelector('.intel-ticker-scroll')).not.toBeNull();
      ticker.destroy();
    });
  });

  describe('update()', () => {
    it('renders items with correct count (doubled for seamless scroll)', () => {
      const ticker = createIntelTicker(container);
      const data = makeIntelData();
      ticker.update(data);

      const items = container.querySelectorAll('.intel-ticker-item');
      // 3 stories × 2 (duplicated for seamless loop) = 6
      expect(items.length).toBe(6);
      ticker.destroy();
    });

    it('items contain story titles', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData());

      const items = container.querySelectorAll('.intel-ticker-item');
      const texts = Array.from(items).map((el) => el.textContent);
      expect(texts.filter((t) => t?.includes('Iran infrastructure'))).toHaveLength(2);
      ticker.destroy();
    });

    it('clears previous items when update is called again', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData());
      ticker.update(makeIntelData({ stories: [
        { title: 'New story', link: '#', severity: 'info', currentScore: 50 },
      ] }));

      const items = container.querySelectorAll('.intel-ticker-item');
      // 1 story × 2 = 2
      expect(items.length).toBe(2);
      ticker.destroy();
    });
  });

  describe('severity dots', () => {
    it('critical severity gets correct dot class', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData({ stories: [
        { title: 'Critical event', link: '#', severity: 'critical', currentScore: 95 },
      ] }));

      const dots = container.querySelectorAll('.intel-ticker-dot--critical');
      // Doubled: 2
      expect(dots.length).toBe(2);
      ticker.destroy();
    });

    it('warning severity gets correct dot class', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData({ stories: [
        { title: 'Warning event', link: '#', severity: 'warning', currentScore: 60 },
      ] }));

      const dots = container.querySelectorAll('.intel-ticker-dot--warning');
      expect(dots.length).toBe(2);
      ticker.destroy();
    });

    it('info severity gets correct dot class', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData({ stories: [
        { title: 'Info event', link: '#', severity: 'info', currentScore: 30 },
      ] }));

      const dots = container.querySelectorAll('.intel-ticker-dot--info');
      expect(dots.length).toBe(2);
      ticker.destroy();
    });
  });

  describe('empty state', () => {
    it('shows placeholder text when no stories', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData({ stories: [] }));

      const placeholder = container.querySelector('.intel-ticker-placeholder');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain('Monitoring intelligence feeds');
      ticker.destroy();
    });

    it('hides placeholder when stories arrive', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData({ stories: [] }));
      ticker.update(makeIntelData());

      const placeholder = container.querySelector('.intel-ticker-placeholder');
      expect(placeholder).toBeNull();
      ticker.destroy();
    });
  });

  describe('destroy()', () => {
    it('removes DOM elements from container', () => {
      const ticker = createIntelTicker(container);
      ticker.update(makeIntelData());
      ticker.destroy();

      expect(container.querySelector('.intel-ticker')).toBeNull();
    });

    it('is safe to call twice', () => {
      const ticker = createIntelTicker(container);
      ticker.destroy();
      expect(() => ticker.destroy()).not.toThrow();
    });
  });
});
