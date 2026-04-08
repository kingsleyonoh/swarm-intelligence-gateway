import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmTheaterPanel } from '../../src/components/SwarmTheaterPanel.js';
import type { TheaterCardData } from '../../src/components/theater-types.js';

function makeCard(overrides: Partial<TheaterCardData> = {}): TheaterCardData {
  return {
    id: 'sim-1',
    theater: 'Test Theater',
    domain: 'conflict',
    agentCount: 4096,
    currentRound: 3,
    totalRounds: 5,
    topPrediction: 'Escalation likely in next 72 hours',
    predictionType: 'Escalation',
    timeHorizon: '72h',
    predictedAt: '2026-04-07T12:00:00Z',
    confidence: 0.85,
    factionSplit: [
      { stance: 'escalate', label: 'Hawks', percentage: 45 },
      { stance: 'de_escalate', label: 'Doves', percentage: 30 },
      { stance: 'uncertain', label: 'Neutral', percentage: 25 },
    ],
    agentDebate: [],
    ...overrides,
  };
}

function makeDebatePost(i: number) {
  return {
    agentId: `agent-${i}`,
    username: `Agent ${i}`,
    faction: i % 2 === 0 ? 'Hawks' : 'Doves',
    stanceColor: i % 2 === 0 ? '#e05252' : '#4a90d9',
    content: `Post content ${i}`,
    timestamp: `2026-04-06T12:00:${String(i).padStart(2, '0')}Z`,
  };
}

describe('SwarmTheaterPanel', () => {
  let panel: SwarmTheaterPanel;
  let container: HTMLElement;

  beforeEach(() => {
    // Stub fetch for report view (it fetches on card click)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ report: '# Test Report', predictions: [] }),
    }));
    panel = new SwarmTheaterPanel();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    panel.unmount();
    container.remove();
    vi.restoreAllMocks();
  });

  describe('instantiation', () => {
    it('has correct id and title', () => {
      expect(panel.id).toBe('swarm-theater');
      expect(panel.title).toBe('Swarm Theater');
    });
  });

  describe('mount', () => {
    it('creates filter bar and grid container', () => {
      panel.mount(container);
      const filterBar = container.querySelector('.theater-filter-bar');
      const grid = container.querySelector('.theater-grid');
      expect(filterBar).not.toBeNull();
      expect(grid).not.toBeNull();
    });

    it('renders domain filter buttons', () => {
      panel.mount(container);
      const buttons = container.querySelectorAll('.theater-filter-bar button');
      const labels = Array.from(buttons).map((b) => b.textContent);
      expect(labels).toContain('all');
      expect(labels).toContain('conflict');
      expect(labels).toContain('market');
      expect(labels).toContain('supply_chain');
      expect(labels).toContain('political');
      expect(labels).toContain('military');
      expect(labels).toContain('cyber');
    });

    it('grid uses CSS Grid with auto-fill minmax(200px, 1fr)', () => {
      panel.mount(container);
      const grid = container.querySelector('.theater-grid') as HTMLElement;
      expect(grid.style.display).toBe('grid');
      expect(grid.style.gridTemplateColumns).toContain('200px');
    });
  });

  describe('update', () => {
    it('renders theater cards for each data item', () => {
      panel.mount(container);
      panel.update([makeCard(), makeCard({ id: 'sim-2', theater: 'Pacific' })]);
      const cards = container.querySelectorAll('.theater-card');
      expect(cards.length).toBe(2);
    });

    it('card displays theater name', () => {
      panel.mount(container);
      panel.update([makeCard({ theater: 'South China Sea' })]);
      const name = container.querySelector('.theater-card h3');
      expect(name?.textContent).toBe('South China Sea');
    });

    it('card displays agent count in meta row', () => {
      panel.mount(container);
      panel.update([makeCard({ agentCount: 2048 })]);
      const badge = container.querySelector('.agent-count-badge');
      expect(badge?.textContent).toContain('2,048');
    });

    it('card displays prediction type badge', () => {
      panel.mount(container);
      panel.update([makeCard({ predictionType: 'Escalation' })]);
      const badge = container.querySelector('.prediction-type-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('Escalation');
    });

    it('card displays confidence percentage', () => {
      panel.mount(container);
      panel.update([makeCard({ confidence: 0.75 })]);
      const conf = container.querySelector('.prediction-confidence');
      expect(conf).not.toBeNull();
      expect(conf?.textContent).toBe('75%');
    });

    it('card displays top prediction text', () => {
      panel.mount(container);
      panel.update([makeCard({ topPrediction: 'Market crash imminent' })]);
      const pred = container.querySelector('.top-prediction');
      expect(pred?.textContent).toBe('Market crash imminent');
    });

    it('card displays time horizon badge', () => {
      panel.mount(container);
      panel.update([makeCard({ timeHorizon: '72h' })]);
      const horizon = container.querySelector('.prediction-horizon');
      expect(horizon).not.toBeNull();
      expect(horizon?.textContent).toBe('72h');
    });

    it('card displays freshness timestamp', () => {
      panel.mount(container);
      panel.update([makeCard({ predictedAt: new Date(Date.now() - 3600000).toISOString() })]);
      const freshness = container.querySelector('.prediction-freshness');
      expect(freshness).not.toBeNull();
      expect(freshness?.textContent).toContain('h ago');
    });

    it('card renders faction split bar with colored segments', () => {
      panel.mount(container);
      panel.update([
        makeCard({
          factionSplit: [
            { stance: 'escalate', label: 'Hawks', percentage: 60 },
            { stance: 'de_escalate', label: 'Doves', percentage: 40 },
          ],
        }),
      ]);
      const segments = container.querySelectorAll('.faction-segment');
      expect(segments.length).toBe(2);
    });
  });

  describe('domain filtering', () => {
    it('filters cards by domain when filter button clicked', () => {
      panel.mount(container);
      panel.update([
        makeCard({ id: 'sim-1', domain: 'conflict' }),
        makeCard({ id: 'sim-2', domain: 'market' }),
        makeCard({ id: 'sim-3', domain: 'conflict' }),
      ]);

      const conflictBtn = Array.from(
        container.querySelectorAll('.theater-filter-bar button'),
      ).find((b) => b.textContent === 'conflict');
      conflictBtn?.dispatchEvent(new Event('click', { bubbles: true }));

      const visibleCards = container.querySelectorAll(
        '.theater-card:not([hidden])',
      );
      expect(visibleCards.length).toBe(2);
    });

    it('shows all cards when "all" filter is clicked', () => {
      panel.mount(container);
      panel.update([
        makeCard({ id: 'sim-1', domain: 'conflict' }),
        makeCard({ id: 'sim-2', domain: 'market' }),
      ]);

      // First click conflict filter
      const conflictBtn = Array.from(
        container.querySelectorAll('.theater-filter-bar button'),
      ).find((b) => b.textContent === 'conflict');
      conflictBtn?.dispatchEvent(new Event('click', { bubbles: true }));

      // Then click all
      const allBtn = Array.from(
        container.querySelectorAll('.theater-filter-bar button'),
      ).find((b) => b.textContent === 'all');
      allBtn?.dispatchEvent(new Event('click', { bubbles: true }));

      const visibleCards = container.querySelectorAll(
        '.theater-card:not([hidden])',
      );
      expect(visibleCards.length).toBe(2);
    });
  });

  describe('expand/collapse', () => {
    it('clicking a card expands to report view', () => {
      panel.mount(container);
      panel.update([
        makeCard({
          agentDebate: [makeDebatePost(0), makeDebatePost(1)],
        }),
      ]);

      const card = container.querySelector('.theater-card') as HTMLElement;
      card.dispatchEvent(new Event('click', { bubbles: true }));

      const view = container.querySelector('.report-view');
      expect(view).not.toBeNull();
    });

    it('report view shows theater name and loading state', () => {
      panel.mount(container);
      panel.update([makeCard()]);

      const card = container.querySelector('.theater-card') as HTMLElement;
      card.dispatchEvent(new Event('click', { bubbles: true }));

      const header = container.querySelector('.report-hero-theater');
      expect(header?.textContent).toBe('Test Theater');

      const loading = container.querySelector('.report-loading');
      expect(loading).not.toBeNull();
    });

    it('debate feed has a back button that returns to grid', () => {
      panel.mount(container);
      panel.update([makeCard({ agentDebate: [makeDebatePost(0)] })]);

      const card = container.querySelector('.theater-card') as HTMLElement;
      card.dispatchEvent(new Event('click', { bubbles: true }));

      const backBtn = container.querySelector('.debate-back-btn');
      expect(backBtn).not.toBeNull();

      backBtn?.dispatchEvent(new Event('click', { bubbles: true }));
      const grid = container.querySelector('.theater-grid');
      expect(grid).not.toBeNull();
      expect(container.querySelector('.debate-feed')).toBeNull();
    });

    it('limits visible debate posts to 50 (virtual scroll)', () => {
      const posts = Array.from({ length: 80 }, (_, i) => makeDebatePost(i));
      panel.mount(container);
      panel.update([makeCard({ agentDebate: posts })]);

      const card = container.querySelector('.theater-card') as HTMLElement;
      card.dispatchEvent(new Event('click', { bubbles: true }));

      const rendered = container.querySelectorAll('.debate-post');
      expect(rendered.length).toBeLessThanOrEqual(50);
    });
  });

  describe('unmount', () => {
    it('removes all DOM content from container', () => {
      panel.mount(container);
      panel.update([makeCard()]);
      panel.unmount();
      expect(container.children.length).toBe(0);
    });
  });

  describe('empty data', () => {
    it('handles empty array gracefully', () => {
      panel.mount(container);
      panel.update([]);
      const cards = container.querySelectorAll('.theater-card');
      expect(cards.length).toBe(0);
    });

    it('shows empty state message when no data', () => {
      panel.mount(container);
      panel.update([]);
      const empty = container.querySelector('.theater-empty');
      expect(empty).not.toBeNull();
    });
  });
});
