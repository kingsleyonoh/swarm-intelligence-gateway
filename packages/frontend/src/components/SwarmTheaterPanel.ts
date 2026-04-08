/**
 * SwarmTheaterPanel — Hero panel displaying theater simulation cards.
 *
 * CSS Grid of theater cards with domain filtering and expandable
 * agent debate feed. Each card shows theater name, agent count,
 * round progress, top prediction, confidence gauge, and faction bar.
 */

import type { Panel } from '../types.js';
import type { TheaterCardData, TheaterDomain } from './theater-types.js';
import { THEATER_DOMAINS } from './theater-types.js';
import {
  createFactionSplitBar,
  createSimulationPulse,
} from './theater-helpers.js';
import { createReportView } from './report-view.js';
import { createLiveFeed } from './live-feed.js';
import { createActiveSimCard } from './sim-card-active.js';
import { ProgressPoller } from './progress-poller.js';

const ACTIVE_SIM_STATUSES = new Set([
  'pending', 'queued', 'graph_building', 'simulating', 'reporting',
]);

export interface TheaterPanelConfig {
  apiKey: string;
  apiBaseUrl: string;
}

export class SwarmTheaterPanel implements Panel {
  readonly id = 'swarm-theater';
  readonly title = 'Swarm Theater';

  private container: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;
  private filterBarEl: HTMLElement | null = null;
  private cards: TheaterCardData[] = [];
  private activeFilter: 'all' | TheaterDomain = 'all';
  private expandedCardId: string | null = null;
  private apiConfig: TheaterPanelConfig = { apiKey: '', apiBaseUrl: '' };
  private poller = new ProgressPoller({ apiBaseUrl: '', apiKey: '' });

  /** Set API credentials for report fetching (called from main.ts after creation) */
  setApiConfig(config: TheaterPanelConfig): void {
    this.apiConfig = config;
    this.poller.setConfig(config);
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.filterBarEl = this.buildFilterBar();
    container.appendChild(this.filterBarEl);
    this.gridEl = this.buildGrid();
    container.appendChild(this.gridEl);
  }

  unmount(): void {
    this.poller.clearAll();
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.gridEl = null;
    this.filterBarEl = null;
    this.expandedCardId = null;
  }

  update(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.poller.clearAll();
    // Sort newest first, then deduplicate by theater (newest wins)
    const sorted = (data as TheaterCardData[]).sort((a, b) => {
      const ta = a.predictedAt ? new Date(a.predictedAt).getTime() : 0;
      const tb = b.predictedAt ? new Date(b.predictedAt).getTime() : 0;
      return tb - ta;
    });
    const seen = new Set<string>();
    this.cards = sorted.filter((card) => {
      if (seen.has(card.theater)) return false;
      seen.add(card.theater);
      return true;
    });
    this.expandedCardId = null;
    this.renderCards();
  }

  private buildFilterBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'theater-filter-bar';

    for (const domain of THEATER_DOMAINS) {
      const btn = document.createElement('button');
      btn.textContent = domain;
      btn.dataset.domain = domain;
      if (domain === 'all') btn.classList.add('active');
      btn.addEventListener('click', () => this.handleFilter(domain));
      bar.appendChild(btn);
    }

    return bar;
  }

  private buildGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'theater-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
    grid.style.gap = '16px';
    return grid;
  }

  private handleFilter(domain: 'all' | TheaterDomain): void {
    this.activeFilter = domain;
    this.updateFilterButtonStyles();
    this.applyFilter();
  }

  private updateFilterButtonStyles(): void {
    if (!this.filterBarEl) return;
    const buttons = this.filterBarEl.querySelectorAll('button');
    for (const btn of buttons) {
      btn.classList.toggle(
        'active',
        btn.dataset.domain === this.activeFilter,
      );
    }
  }

  private applyFilter(): void {
    if (!this.gridEl) return;
    const cards = this.gridEl.querySelectorAll('.theater-card');
    for (const card of cards) {
      const el = card as HTMLElement;
      if (this.activeFilter === 'all' || el.dataset.domain === this.activeFilter) {
        el.removeAttribute('hidden');
      } else {
        el.setAttribute('hidden', '');
      }
    }
  }

  private renderCards(): void {
    if (!this.gridEl || !this.container) return;

    // If expanded, show debate feed instead
    if (this.expandedCardId) {
      this.showDebateFeed();
      return;
    }

    // Ensure grid is visible
    this.showGridView();

    this.gridEl.innerHTML = '';

    if (this.cards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'theater-empty';
      empty.textContent = 'No active simulations';
      this.gridEl.appendChild(empty);
      return;
    }

    for (const cardData of this.cards) {
      this.gridEl.appendChild(this.buildCard(cardData));
    }

    this.applyFilter();
  }

  private buildCard(data: TheaterCardData): HTMLElement {
    // Skip active simulations — the swarm hero handles the live visualization
    const isActive = ACTIVE_SIM_STATUSES.has(data.status ?? '');
    if (isActive) {
      const skip = document.createElement('div');
      skip.style.display = 'none';
      return skip;
    }

    const card = document.createElement('div');
    card.className = 'theater-card';
    card.dataset.domain = data.domain;
    card.dataset.cardId = data.id;

    // Fallback pulse for any non-active status with progress
    const pulse = createSimulationPulse(data.status);
    if (pulse) {
      card.classList.add('theater-card--simulating');
      card.appendChild(pulse);
    }

    // Prediction type badge + confidence — the hero
    const predHeader = document.createElement('div');
    predHeader.className = 'prediction-header';

    const typeBadge = document.createElement('span');
    typeBadge.className = `prediction-type-badge prediction-type--${(data.predictionType || 'unknown').toLowerCase().replace(/\s+/g, '-')}`;
    typeBadge.textContent = data.predictionType || 'Analysis';
    predHeader.appendChild(typeBadge);

    const confEl = document.createElement('span');
    confEl.className = 'prediction-confidence';
    confEl.textContent = `${Math.round(data.confidence * 100)}%`;
    predHeader.appendChild(confEl);

    if (data.timeHorizon) {
      const horizon = document.createElement('span');
      horizon.className = 'prediction-horizon';
      horizon.textContent = data.timeHorizon;
      predHeader.appendChild(horizon);
    }

    // "NEW" badge for predictions less than 1 hour old
    const ageMs = data.predictedAt ? Date.now() - new Date(data.predictedAt).getTime() : Infinity;
    if (ageMs < 3600000) {
      const newBadge = document.createElement('span');
      newBadge.className = 'prediction-new-badge';
      newBadge.textContent = 'NEW';
      predHeader.appendChild(newBadge);
      card.classList.add('theater-card--new');
    }

    card.appendChild(predHeader);

    // Theater name
    const name = document.createElement('h3');
    name.textContent = data.theater;
    card.appendChild(name);

    // Prediction summary — the core value
    const pred = document.createElement('p');
    pred.className = 'top-prediction';
    pred.textContent = data.topPrediction;
    card.appendChild(pred);

    // Meta row: agent count + freshness
    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const badge = document.createElement('span');
    badge.className = 'agent-count-badge';
    badge.textContent = `${data.agentCount.toLocaleString()} agents`;
    meta.appendChild(badge);

    const freshness = document.createElement('span');
    freshness.className = 'prediction-freshness';
    freshness.textContent = this.formatFreshness(data.predictedAt);
    meta.appendChild(freshness);

    if (data.signalCount && data.signalCount > 0) {
      const signals = document.createElement('span');
      signals.className = 'signal-attribution';
      signals.textContent = `Based on ${data.signalCount} intelligence signals`;
      meta.appendChild(signals);
    }

    card.appendChild(meta);

    // Faction split bar
    card.appendChild(createFactionSplitBar(data.factionSplit));

    card.addEventListener('click', () => this.expandCard(data.id));

    return card;
  }

  private formatFreshness(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  private expandCard(cardId: string): void {
    this.expandedCardId = cardId;
    this.showDebateFeed();
  }

  private showDebateFeed(): void {
    if (!this.container) return;
    const cardData = this.cards.find((c) => c.id === this.expandedCardId);
    if (!cardData) return;

    // Hide grid and filter bar
    if (this.gridEl) this.gridEl.style.display = 'none';
    if (this.filterBarEl) this.filterBarEl.style.display = 'none';

    // Remove any existing view
    const existing = this.container.querySelector('.report-view')
      ?? this.container.querySelector('.live-feed')
      ?? this.container.querySelector('.debate-feed');
    if (existing) existing.remove();

    const ACTIVE_STATUSES = new Set([
      'pending', 'queued', 'graph_building', 'simulating', 'reporting',
    ]);
    const isActive = ACTIVE_STATUSES.has(cardData.status ?? '');

    if (isActive) {
      const feed = createLiveFeed(
        cardData.id,
        cardData.theater,
        this.apiConfig.apiKey,
        this.apiConfig.apiBaseUrl,
        () => { this.expandedCardId = null; this.showGridView(); },
      );
      this.container.appendChild(feed);
    } else {
      const view = createReportView(
        cardData.id,
        cardData.theater,
        this.apiConfig.apiKey,
        this.apiConfig.apiBaseUrl,
        () => { this.expandedCardId = null; this.showGridView(); },
      );
      this.container.appendChild(view);
    }
  }

  private showGridView(): void {
    if (!this.container) return;

    // Remove report/debate/live-feed view
    const view = this.container.querySelector('.report-view')
      ?? this.container.querySelector('.live-feed')
      ?? this.container.querySelector('.debate-feed');
    if (view) view.remove();

    // Restore grid and filter bar
    if (this.gridEl) {
      this.gridEl.style.display = 'grid';
      this.gridEl.style.gridTemplateColumns =
        'repeat(auto-fill, minmax(320px, 1fr))';
    }
    if (this.filterBarEl) this.filterBarEl.style.display = '';
  }

}
