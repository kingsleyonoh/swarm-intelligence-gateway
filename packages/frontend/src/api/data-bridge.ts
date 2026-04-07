/**
 * DataBridge — connects SmartPollLoop instances to panel update() methods.
 *
 * Creates one poll loop per data feed (simulations, predictions, heatmap),
 * transforms API responses into panel-compatible data shapes, and manages lifecycle.
 */

import type { Panel, RefreshIntervals } from '../types.js';
import type { TheaterCardData, FactionSplitSegment, TheaterDomain } from '../components/theater-types.js';
import type { PredictionTimelineData, PredictionPoint } from '../components/prediction-types.js';
import type { HeatmapPanelData } from '../components/heatmap-types.js';
import { SmartPollLoop } from '../core/smart-poll-loop.js';

export interface DataBridgeConfig {
  apiBaseUrl: string;
  apiKey: string;
  refreshIntervals: RefreshIntervals;
  panels: Map<string, Panel>;
}

/** Raw API simulation row */
interface ApiSimulation {
  id: string;
  scenarioId: string;
  status: string;
  agentCount?: number;
  roundCount?: number;
  report?: string | null;
  createdAt: string;
}

/** Raw API prediction row */
interface ApiPrediction {
  id: string;
  simulationId: string;
  theater: string;
  predictionType: string;
  summary: string;
  confidence: number | string;
  timeHorizon: string;
  supportingFactions?: string;
  dissentingFactions?: string;
  createdAt: string;
}

function inferDomain(theater: string): TheaterDomain {
  const lower = theater.toLowerCase();
  if (lower.includes('china') || lower.includes('sea') || lower.includes('naval')) return 'military';
  if (lower.includes('europe')) return 'political';
  if (lower.includes('africa') || lower.includes('supply')) return 'supply_chain';
  if (lower.includes('middle east') || lower.includes('hormuz') || lower.includes('gulf')) return 'conflict';
  if (lower.includes('cyber')) return 'cyber';
  if (lower.includes('market') || lower.includes('econom')) return 'market';
  return 'political';
}

// Cache predictions for enriching simulation cards
let cachedPredictions: ApiPrediction[] = [];

function transformSimulations(apiResponse: unknown): TheaterCardData[] {
  const resp = apiResponse as { data?: ApiSimulation[] };
  const sims = resp.data ?? [];
  if (!Array.isArray(sims)) return [];

  return sims.map((sim) => {
    // Find predictions for this simulation
    const simPreds = cachedPredictions.filter((p) => p.simulationId === sim.id);
    const topPred = simPreds.sort((a, b) => {
      const ca = typeof a.confidence === 'string' ? parseFloat(a.confidence) : a.confidence;
      const cb = typeof b.confidence === 'string' ? parseFloat(b.confidence) : b.confidence;
      return cb - ca;
    })[0];

    const theater = topPred?.theater ?? 'Simulation Theater';
    const conf = topPred
      ? (typeof topPred.confidence === 'string' ? parseFloat(topPred.confidence) : topPred.confidence)
      : 0.75;

    const factionSplit: FactionSplitSegment[] = [
      { stance: 'escalate', label: 'Hawks', percentage: 45 },
      { stance: 'de_escalate', label: 'Moderates', percentage: 35 },
      { stance: 'uncertain', label: 'Uncertain', percentage: 20 },
    ];

    return {
      id: sim.id,
      theater,
      domain: inferDomain(theater),
      agentCount: sim.agentCount ?? 4096,
      currentRound: sim.status === 'completed' ? (sim.roundCount ?? 5) : 0,
      totalRounds: sim.roundCount ?? 5,
      topPrediction: topPred?.summary?.slice(0, 150) ?? 'Simulation completed — awaiting prediction analysis',
      confidence: conf,
      factionSplit,
      agentDebate: [],
    };
  });
}

function transformPredictions(apiResponse: unknown): PredictionTimelineData {
  const resp = apiResponse as { data?: ApiPrediction[] };
  const preds = resp.data ?? [];
  if (!Array.isArray(preds)) return { predictions: [] };

  // Cache for simulation card enrichment
  cachedPredictions = preds;

  const points: PredictionPoint[] = preds.map((p) => ({
    id: p.id,
    simulationId: p.simulationId,
    theater: p.theater,
    predictionType: p.predictionType as PredictionPoint['predictionType'],
    summary: p.summary ?? '',
    confidence: typeof p.confidence === 'string' ? parseFloat(p.confidence) : p.confidence,
    timeHorizon: p.timeHorizon ?? '72h',
    supportingFactions: p.supportingFactions ? p.supportingFactions.split(',').map((s: string) => s.trim()) : [],
    dissentingFactions: p.dissentingFactions ? p.dissentingFactions.split(',').map((s: string) => s.trim()) : [],
    createdAt: p.createdAt,
  }));

  return { predictions: points };
}

function transformHeatmap(apiResponse: unknown): HeatmapPanelData {
  const resp = apiResponse as { data?: ApiPrediction[] };
  const preds = resp.data ?? [];
  return { predictionCount: Array.isArray(preds) ? preds.length : 0 };
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

    // Simulations → SwarmTheaterPanel (transform to TheaterCardData[])
    loops.push(
      this.createTransformedLoop(
        `${base}/api/simulations?status=completed&limit=5`,
        refreshIntervals.simulations,
        headers,
        panels.get('swarm-theater'),
        transformSimulations,
      ),
    );

    // Predictions → PredictionTimelinePanel (transform to PredictionTimelineData)
    loops.push(
      this.createTransformedLoop(
        `${base}/api/predictions?limit=100`,
        refreshIntervals.predictions,
        headers,
        panels.get('prediction-timeline'),
        transformPredictions,
      ),
    );

    // Latest predictions → ConsensusHeatmapPanel (transform to HeatmapPanelData)
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
