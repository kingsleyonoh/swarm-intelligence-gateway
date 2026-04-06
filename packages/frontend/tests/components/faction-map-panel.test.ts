import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FactionMapPanel } from '../../src/components/FactionMapPanel.js';
import type { FactionGraphData } from '../../src/components/faction-types.js';

function makeFactionData(overrides: Partial<FactionGraphData> = {}): FactionGraphData {
  return {
    nodes: [
      {
        id: 'faction-1',
        name: 'Hawks',
        memberCount: 100,
        stance: 'escalate',
        keyAgents: ['Agent A', 'Agent B'],
      },
      {
        id: 'faction-2',
        name: 'Doves',
        memberCount: 60,
        stance: 'de_escalate',
        keyAgents: ['Agent C'],
      },
      {
        id: 'faction-3',
        name: 'Observers',
        memberCount: 30,
        stance: 'neutral',
        keyAgents: ['Agent D'],
      },
    ],
    edges: [
      {
        source: 'faction-1',
        target: 'faction-2',
        weight: 0.8,
      },
      {
        source: 'faction-2',
        target: 'faction-3',
        weight: 0.3,
      },
    ],
    ...overrides,
  };
}

describe('FactionMapPanel', () => {
  let panel: FactionMapPanel;
  let container: HTMLElement;

  beforeEach(() => {
    panel = new FactionMapPanel();
    container = document.createElement('div');
    // D3 needs measurable container
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(container);
  });

  afterEach(() => {
    panel.unmount();
    container.remove();
  });

  describe('instantiation', () => {
    it('has correct id and title', () => {
      expect(panel.id).toBe('faction-map');
      expect(panel.title).toBe('Faction Map');
    });
  });

  describe('mount', () => {
    it('creates SVG element in container', () => {
      panel.mount(container);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('SVG fills container dimensions', () => {
      panel.mount(container);
      const svg = container.querySelector('svg') as SVGSVGElement;
      expect(svg.getAttribute('width')).toBe('100%');
      expect(svg.getAttribute('viewBox')).toBeTruthy();
    });
  });

  describe('update', () => {
    it('renders circle nodes for each faction', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      const nodes = container.querySelectorAll('.faction-node');
      expect(nodes.length).toBe(3);
    });

    it('nodes are sized based on member count (20px-80px)', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      const nodes = container.querySelectorAll('.faction-node');
      const radii = Array.from(nodes).map((n) =>
        parseFloat(n.getAttribute('r') ?? '0'),
      );
      // Largest faction (100 members) should have largest radius
      // Smallest faction (30 members) should have smallest radius
      expect(Math.max(...radii)).toBeGreaterThanOrEqual(10);
      expect(Math.min(...radii)).toBeGreaterThanOrEqual(10);
      expect(Math.max(...radii)).toBeLessThanOrEqual(45);
    });

    it('nodes are colored by stance', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      const nodes = container.querySelectorAll('.faction-node');
      const fills = Array.from(nodes).map((n) => n.getAttribute('fill'));
      expect(fills).toContain('#e05252'); // escalate = red
      expect(fills).toContain('#4a90d9'); // de_escalate = blue
      expect(fills).toContain('#888'); // neutral = gray
    });

    it('renders edges as lines between factions', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      const edges = container.querySelectorAll('.faction-edge');
      expect(edges.length).toBe(2);
    });

    it('edges have stroke width between 1-4px based on weight', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      const edges = container.querySelectorAll('.faction-edge');
      const widths = Array.from(edges).map((e) =>
        parseFloat(e.getAttribute('stroke-width') ?? '0'),
      );
      for (const w of widths) {
        expect(w).toBeGreaterThanOrEqual(1);
        expect(w).toBeLessThanOrEqual(4);
      }
    });

    it('edges are colored by source node stance', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      const edges = container.querySelectorAll('.faction-edge');
      // First edge: source is faction-1 (escalate → #e05252)
      expect(edges[0]?.getAttribute('stroke')).toBe('#e05252');
      expect(edges[0]?.getAttribute('stroke-opacity')).toBe('0.3');
      // Second edge: source is faction-2 (de_escalate → #4a90d9)
      expect(edges[1]?.getAttribute('stroke')).toBe('#4a90d9');
      expect(edges[1]?.getAttribute('stroke-opacity')).toBe('0.3');
    });

    it('renders node labels', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      const labels = container.querySelectorAll('.faction-label');
      const texts = Array.from(labels).map((l) => l.textContent);
      expect(texts).toContain('Hawks');
      expect(texts).toContain('Doves');
      expect(texts).toContain('Observers');
    });
  });

  describe('hover tooltip', () => {
    it('creates tooltip element on mount', () => {
      panel.mount(container);
      const tooltip = container.querySelector('.faction-tooltip');
      expect(tooltip).not.toBeNull();
    });

    it('tooltip is hidden by default', () => {
      panel.mount(container);
      const tooltip = container.querySelector(
        '.faction-tooltip',
      ) as HTMLElement;
      expect(tooltip.style.display).toBe('none');
    });
  });

  describe('data with uncertain stance', () => {
    it('colors uncertain nodes yellow', () => {
      panel.mount(container);
      panel.update(
        makeFactionData({
          nodes: [
            {
              id: 'f-1',
              name: 'Watchers',
              memberCount: 50,
              stance: 'uncertain',
              keyAgents: ['Agent X'],
            },
          ],
          edges: [],
        }),
      );
      const node = container.querySelector('.faction-node');
      expect(node?.getAttribute('fill')).toBe('#d4a843');
    });
  });

  describe('unmount', () => {
    it('removes all DOM content from container', () => {
      panel.mount(container);
      panel.update(makeFactionData());
      panel.unmount();
      expect(container.children.length).toBe(0);
    });
  });

  describe('empty data', () => {
    it('handles empty nodes and edges gracefully', () => {
      panel.mount(container);
      panel.update({ nodes: [], edges: [] });
      const nodes = container.querySelectorAll('.faction-node');
      const edges = container.querySelectorAll('.faction-edge');
      expect(nodes.length).toBe(0);
      expect(edges.length).toBe(0);
    });
  });
});
