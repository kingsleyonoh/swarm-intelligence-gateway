/**
 * DataBridge — connects SmartPollLoop instances to panel update() methods.
 *
 * Creates one poll loop per data feed (simulations, predictions, heatmap),
 * routes responses to the correct mounted panel, and manages lifecycle.
 */

import type { Panel, RefreshIntervals } from '../types.js';
import { SmartPollLoop } from '../core/smart-poll-loop.js';

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
    this.loops = this.createLoops();
    for (const loop of this.loops) {
      loop.start();
    }
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

  private createLoops(): SmartPollLoop[] {
    const { apiBaseUrl, apiKey, refreshIntervals, panels } = this.config;
    const base = apiBaseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    };
    const loops: SmartPollLoop[] = [];

    loops.push(
      this.createLoop(
        `${base}/api/simulations?status=completed&limit=5`,
        refreshIntervals.simulations,
        headers,
        panels.get('swarm-theater'),
      ),
    );

    loops.push(
      this.createLoop(
        `${base}/api/predictions?limit=100`,
        refreshIntervals.predictions,
        headers,
        panels.get('prediction-timeline'),
      ),
    );

    loops.push(
      this.createLoop(
        `${base}/api/predictions/latest?minConfidence=0.7&limit=10`,
        refreshIntervals.heatmap,
        headers,
        panels.get('consensus-heatmap'),
      ),
    );

    return loops;
  }

  private createLoop(
    url: string,
    intervalMs: number,
    headers: Record<string, string>,
    panel: Panel | undefined,
  ): SmartPollLoop {
    return new SmartPollLoop({
      url,
      intervalMs,
      fetchOptions: { headers },
      onData: (data: unknown) => {
        if (panel) {
          panel.update(data);
        }
      },
      onError: (err: Error) => {
        // Log but don't crash — SmartPollLoop handles backoff
        console.warn(`[DataBridge] Poll error for ${url}: ${err.message}`);
      },
    });
  }
}
