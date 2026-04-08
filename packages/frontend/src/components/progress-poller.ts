/**
 * Progress polling for active simulations.
 * Polls GET /api/simulations/:id/progress and updates card DOM.
 */

import { formatElapsed } from './theater-helpers.js';

const PHASE_LABELS: Record<string, string> = {
  pending: 'QUEUED',
  queued: 'QUEUED',
  graph_building: 'BUILDING GRAPH',
  simulating: 'RUNNING SWARM',
  reporting: 'GENERATING REPORT',
};

const POLL_INTERVAL_MS = 5000;

export interface PollerConfig {
  apiBaseUrl: string;
  apiKey: string;
}

/**
 * Manages progress polling intervals for active simulation cards.
 * Call `start()` per card, `clearAll()` on unmount/update.
 */
export class ProgressPoller {
  private intervals: Map<string, number> = new Map();
  private config: PollerConfig;

  constructor(config: PollerConfig) {
    this.config = config;
  }

  /** Update poller credentials (e.g. when setApiConfig is called). */
  setConfig(config: PollerConfig): void {
    this.config = config;
  }

  /** Start polling progress for a simulation, updating the card DOM. */
  start(simId: string, card: HTMLElement): void {
    if (this.intervals.has(simId)) return;
    if (!this.config.apiBaseUrl || !this.config.apiKey) return;

    const intervalId = window.setInterval(() => {
      this.fetchAndUpdate(simId, card);
    }, POLL_INTERVAL_MS);
    this.intervals.set(simId, intervalId);
  }

  /** Stop polling for a specific simulation. */
  stop(simId: string): void {
    const id = this.intervals.get(simId);
    if (id != null) {
      clearInterval(id);
      this.intervals.delete(simId);
    }
  }

  /** Stop all active polling. */
  clearAll(): void {
    for (const [, id] of this.intervals) {
      clearInterval(id);
    }
    this.intervals.clear();
  }

  private async fetchAndUpdate(
    simId: string,
    card: HTMLElement,
  ): Promise<void> {
    try {
      const url =
        `${this.config.apiBaseUrl}/api/simulations/${simId}/progress`;
      const res = await fetch(url, {
        headers: { 'x-api-key': this.config.apiKey },
      });
      if (!res.ok) return;
      const data = await res.json();

      // Update elapsed time display
      const timeEl = card.querySelector('.live-progress-time');
      if (timeEl && data.elapsedMs > 0) {
        timeEl.textContent = formatElapsed(data.elapsedMs);
      }

      // Update label if phase changed
      const labelEl = card.querySelector('.live-progress-label');
      if (labelEl) {
        const newLabel = PHASE_LABELS[data.status];
        if (newLabel) labelEl.textContent = newLabel;
      }

      // Stop polling if terminal
      if (!data.isActive) {
        this.stop(simId);
      }
    } catch {
      // Network errors: stop polling to avoid log spam
      this.stop(simId);
    }
  }
}
