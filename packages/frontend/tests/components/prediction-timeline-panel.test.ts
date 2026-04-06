import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PredictionTimelinePanel } from '../../src/components/PredictionTimelinePanel.js';
import type {
  PredictionPoint,
  PredictionTimelineData,
} from '../../src/components/prediction-types.js';
import { PREDICTION_TYPE_COLORS } from '../../src/components/prediction-types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makePoint(overrides: Partial<PredictionPoint> = {}): PredictionPoint {
  return {
    id: 'pred-1',
    simulationId: 'sim-1',
    theater: 'Middle East',
    predictionType: 'escalation',
    summary: 'Tensions rising in region',
    confidence: 0.85,
    timeHorizon: '72h',
    supportingFactions: ['Hawks'],
    dissentingFactions: ['Doves'],
    createdAt: '2026-04-05T12:00:00Z',
    ...overrides,
  };
}

function makeTimelineData(
  points: PredictionPoint[] = [],
): PredictionTimelineData {
  return { predictions: points };
}

describe('PredictionTimelinePanel', () => {
  let panel: PredictionTimelinePanel;
  let container: HTMLElement;

  beforeEach(() => {
    panel = new PredictionTimelinePanel();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    panel.unmount();
    container.remove();
  });

  describe('instantiation', () => {
    it('has correct id and title', () => {
      expect(panel.id).toBe('prediction-timeline');
      expect(panel.title).toBe('Prediction Timeline');
    });
  });

  describe('mount', () => {
    it('creates SVG element with viewBox', () => {
      panel.mount(container);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('viewBox')).toBeTruthy();
    });

    it('renders X-axis label (Time)', () => {
      panel.mount(container);
      const labels = container.querySelectorAll('text');
      const texts = Array.from(labels).map((t) => t.textContent);
      expect(texts.some((t) => t?.includes('Time'))).toBe(true);
    });

    it('renders Y-axis label (Confidence)', () => {
      panel.mount(container);
      const labels = container.querySelectorAll('text');
      const texts = Array.from(labels).map((t) => t.textContent);
      expect(texts.some((t) => t?.includes('Confidence'))).toBe(true);
    });
  });

  describe('update — dot rendering', () => {
    it('renders a dot for each prediction', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ id: 'p1' }),
          makePoint({ id: 'p2', confidence: 0.6 }),
          makePoint({ id: 'p3', confidence: 0.3 }),
        ]),
      );
      const dots = container.querySelectorAll('.prediction-dot');
      expect(dots.length).toBe(3);
    });

    it('colors escalation dots red (#e05252)', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ predictionType: 'escalation' }),
        ]),
      );
      const dot = container.querySelector('.prediction-dot');
      expect(dot?.getAttribute('fill')).toBe(
        PREDICTION_TYPE_COLORS.escalation,
      );
    });

    it('colors de_escalation dots blue (#4a90d9)', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ predictionType: 'de_escalation' }),
        ]),
      );
      const dot = container.querySelector('.prediction-dot');
      expect(dot?.getAttribute('fill')).toBe(
        PREDICTION_TYPE_COLORS.de_escalation,
      );
    });

    it('colors market_shift dots gold (#d4a843)', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ predictionType: 'market_shift' }),
        ]),
      );
      const dot = container.querySelector('.prediction-dot');
      expect(dot?.getAttribute('fill')).toBe(
        PREDICTION_TYPE_COLORS.market_shift,
      );
    });

    it('colors sentiment_cascade dots purple (#9b59b6)', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ predictionType: 'sentiment_cascade' }),
        ]),
      );
      const dot = container.querySelector('.prediction-dot');
      expect(dot?.getAttribute('fill')).toBe(
        PREDICTION_TYPE_COLORS.sentiment_cascade,
      );
    });
  });

  describe('update — theater lines', () => {
    it('connects dots for the same theater with line segments', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({
            id: 'p1',
            theater: 'Middle East',
            createdAt: '2026-04-04T12:00:00Z',
            confidence: 0.7,
          }),
          makePoint({
            id: 'p2',
            theater: 'Middle East',
            createdAt: '2026-04-05T12:00:00Z',
            confidence: 0.85,
          }),
        ]),
      );
      const lines = container.querySelectorAll('.theater-line');
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it('does not connect dots from different theaters', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ id: 'p1', theater: 'Middle East' }),
          makePoint({ id: 'p2', theater: 'Pacific' }),
        ]),
      );
      const lines = container.querySelectorAll('.theater-line');
      expect(lines.length).toBe(0);
    });
  });

  describe('hover tooltip', () => {
    it('shows tooltip on mouseenter of a dot', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ theater: 'South China Sea', summary: 'Naval buildup' }),
        ]),
      );
      const dot = container.querySelector('.prediction-dot') as SVGElement;
      dot.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      const tooltip = container.querySelector(
        '.prediction-tooltip',
      ) as HTMLElement;
      expect(tooltip).not.toBeNull();
      expect(tooltip.style.display).not.toBe('none');
      expect(tooltip.textContent).toContain('South China Sea');
      expect(tooltip.textContent).toContain('Naval buildup');
    });

    it('tooltip contains confidence and time horizon', () => {
      panel.mount(container);
      panel.update(
        makeTimelineData([
          makePoint({ confidence: 0.92, timeHorizon: '48h' }),
        ]),
      );
      const dot = container.querySelector('.prediction-dot') as SVGElement;
      dot.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      const tooltip = container.querySelector(
        '.prediction-tooltip',
      ) as HTMLElement;
      expect(tooltip.textContent).toContain('0.92');
      expect(tooltip.textContent).toContain('48h');
    });

    it('hides tooltip on mouseleave', () => {
      panel.mount(container);
      panel.update(makeTimelineData([makePoint()]));
      const dot = container.querySelector('.prediction-dot') as SVGElement;

      dot.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      dot.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      const tooltip = container.querySelector(
        '.prediction-tooltip',
      ) as HTMLElement;
      expect(tooltip.style.display).toBe('none');
    });
  });

  describe('empty data', () => {
    it('shows "No predictions" message when data is empty', () => {
      panel.mount(container);
      panel.update(makeTimelineData([]));
      const emptyMsg = container.querySelector('.timeline-empty');
      expect(emptyMsg).not.toBeNull();
      expect(emptyMsg?.textContent).toContain('No predictions');
    });
  });

  describe('unmount', () => {
    it('removes all DOM content from container', () => {
      panel.mount(container);
      panel.update(makeTimelineData([makePoint()]));
      panel.unmount();
      expect(container.children.length).toBe(0);
    });
  });
});
