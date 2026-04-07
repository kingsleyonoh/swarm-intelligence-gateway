/**
 * DataBridge — connects SmartPollLoop instances to panel update() methods.
 *
 * Creates one poll loop per data feed (simulations, predictions, heatmap),
 * transforms API responses into panel-compatible data shapes, and manages lifecycle.
 */

import type { Panel, RefreshIntervals } from '../types.js';
import { SmartPollLoop } from '../core/smart-poll-loop.js';
import {
  transformSimulations,
  transformPredictions,
  transformFactions,
  transformHeatmap,
  getCachedPredictions,
} from './data-bridge-transforms.js';
import type { ApiPrediction } from './data-bridge-transforms.js';

export interface DataBridgeConfig {
  apiBaseUrl: string;
  apiKey: string;
  refreshIntervals: RefreshIntervals;
  panels: Map<string, Panel>;
}

export class DataBridge {
  private readonly config: DataBridgeConfig;
  private loops: SmartPollLoop[] = [];
  private running = false;

  constructor(config: DataBridgeConfig) {
    this.config = config;
  }

  startAll(): void {
    if (this.running) return;
    this.running = true;
    this.startLoops();
  }

  stopAll(): void {
    for (const loop of this.loops) {
      loop.stop();
    }
    this.loops = [];
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private startLoops(): void {
    if (!this.running) return;
    this.loops = this.createLoops();
    for (const loop of this.loops) {
      loop.start();
    }
  }

  private createLoops(): SmartPollLoop[] {
    const { apiBaseUrl, apiKey, refreshIntervals, panels } = this.config;
    const base = apiBaseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    };
    const loops: SmartPollLoop[] = [];

    // Predictions FIRST → populates cache before simulations transform
    const factionPanel = panels.get('faction-map');
    loops.push(
      this.createTransformedLoop(
        `${base}/api/predictions?limit=100`,
        refreshIntervals.predictions,
        headers,
        panels.get('prediction-timeline'),
        (data: unknown) => {
          const timeline = transformPredictions(data);
          if (factionPanel) {
            factionPanel.update(transformFactions(getCachedPredictions()));
          }
          return timeline;
        },
      ),
    );

    // Simulations → SwarmTheaterPanel (uses cached predictions for enrichment)
    loops.push(
      this.createTransformedLoop(
        `${base}/api/simulations?status=completed&limit=5`,
        refreshIntervals.simulations,
        headers,
        panels.get('swarm-theater'),
        transformSimulations,
      ),
    );

    // Latest predictions → ConsensusHeatmapPanel
    loops.push(
      this.createTransformedLoop(
        `${base}/api/predictions/latest?minConfidence=0.5&limit=20`,
        refreshIntervals.heatmap,
        headers,
        panels.get('consensus-heatmap'),
        transformHeatmap,
      ),
    );

    return loops;
  }

  private createTransformedLoop(
    url: string,
    intervalMs: number,
    headers: Record<string, string>,
    panel: Panel | undefined,
    transform: (data: unknown) => unknown,
  ): SmartPollLoop {
    return new SmartPollLoop({
      url,
      intervalMs,
      fetchOptions: { headers },
      onData: (data: unknown) => {
        if (panel) {
          const transformed = transform(data);
          panel.update(transformed);
        }
      },
      onError: (err: Error) => {
        console.warn(`[DataBridge] Poll error for ${url}: ${err.message}`);
      },
    });
  }
}
