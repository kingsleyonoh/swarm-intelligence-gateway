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
import { createReportView } from './report-view.js';
import { createLiveFeed } from './live-feed.js';
import { ProgressPoller } from './progress-poller.js';
import { buildTheaterCard } from './theater-card-renderer.js';

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
      this.gridEl.appendChild(buildTheaterCard(cardData, () => this.expandCard(cardData.id)));
    }

    this.applyFilter();
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
