/**
 * Data transformation functions for DataBridge.
 *
 * Converts raw API responses into panel-compatible data shapes:
 * - Simulations → TheaterCardData[] (SwarmTheaterPanel)
 * - Predictions → PredictionTimelineData (PredictionTimelinePanel)
 * - Predictions → FactionGraphData (FactionMapPanel)
 * - Predictions → HeatmapPanelData (ConsensusHeatmapPanel)
 */

import type { TheaterCardData, FactionSplitSegment, AgentDebatePost, TheaterDomain } from '../components/theater-types.js';
import type { PredictionTimelineData, PredictionPoint } from '../components/prediction-types.js';
import type { HeatmapPanelData } from '../components/heatmap-types.js';
import type { IntelligenceData, IntelStory, IntelForecast } from '../components/intelligence-types.js';
import { formatPredictionType, parseFactions } from './prediction-transform-utils.js';

export { transformFactions } from './faction-transforms.js';

/** Raw API simulation row */
export interface ApiSimulation {
  id: string;
  scenarioId: string;
  status: string;
  agentCount?: number;
  roundCount?: number;
  report?: string | null;
  createdAt: string;
}

/** Raw API prediction row */
export interface ApiPrediction {
  id: string;
  simulationId: string;
  theater: string;
  predictionType: string;
  summary: string;
  confidence: number | string;
  timeHorizon: string;
  supportingFactions?: string | string[];
  dissentingFactions?: string | string[];
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

/** Map prediction type to stance color (matches theater-helpers STANCE_COLORS) */
function stanceColorFromType(predictionType: string): string {
  if (predictionType === 'escalation') return '#e05252';
  if (predictionType === 'de_escalation') return '#4a90d9';
  if (predictionType === 'market_shift') return '#d4a843';
  return '#9b59b6';
}

/** Derive faction split from prediction types instead of hardcoding */
function buildFactionSplit(preds: ApiPrediction[]): FactionSplitSegment[] {
  if (preds.length === 0) {
    return [{ stance: 'uncertain', label: 'No data', percentage: 100 }];
  }
  const counts = { escalate: 0, de_escalate: 0, uncertain: 0 };
  for (const p of preds) {
    if (p.predictionType === 'escalation') counts.escalate++;
    else if (p.predictionType === 'de_escalation') counts.de_escalate++;
    else counts.uncertain++;
  }
  const total = preds.length;
  const segments: FactionSplitSegment[] = [];
  if (counts.escalate > 0) {
    segments.push({ stance: 'escalate', label: 'Escalation', percentage: Math.round((counts.escalate / total) * 100) });
  }
  if (counts.de_escalate > 0) {
    segments.push({ stance: 'de_escalate', label: 'De-escalation', percentage: Math.round((counts.de_escalate / total) * 100) });
  }
  if (counts.uncertain > 0) {
    segments.push({ stance: 'uncertain', label: 'Other', percentage: Math.round((counts.uncertain / total) * 100) });
  }
  return segments;
}

// Module-level cache shared between transform functions
let cachedPredictions: ApiPrediction[] = [];

/** Get the current cached predictions (for faction graph derivation) */
export function getCachedPredictions(): ApiPrediction[] {
  return cachedPredictions;
}

/** Build debate posts from predictions for a simulation */
function buildDebatePosts(preds: ApiPrediction[]): AgentDebatePost[] {
  return preds.slice(0, 5).map((p, i) => {
    const factions = parseFactions(p.supportingFactions);
      const faction = factions[0] || `${p.theater} ${formatPredictionType(p.predictionType)}`;
    return {
      agentId: `agent-${p.id}-${i}`,
      username: faction.replace(/\s+/g, '_'),
      faction,
      stanceColor: stanceColorFromType(p.predictionType),
      content: p.summary,
      timestamp: p.createdAt,
    };
  });
}

export function transformSimulations(apiResponse: unknown): TheaterCardData[] {
  const resp = apiResponse as { data?: ApiSimulation[] };
  const sims = resp.data ?? [];
  if (!Array.isArray(sims)) return [];

  return sims.map((sim) => {
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

    const factionSplit = buildFactionSplit(simPreds);

    // Compute signal count from cached intelligence forecasts
    const intel = cachedIntelligence;
    let signalCount = 0;
    if (intel && intel.forecasts.length > 0) {
      const theaterLower = theater.toLowerCase();
      const matched = intel.forecasts.filter(
        (f) => theaterLower.includes(f.region.toLowerCase()) || f.region.toLowerCase().includes(theaterLower),
      );
      signalCount = matched.length > 0 ? matched.length : intel.forecasts.length;
    }

    return {
      id: sim.id,
      theater,
      domain: inferDomain(theater),
      agentCount: sim.agentCount ?? 4096,
      currentRound: sim.status === 'completed' ? (sim.roundCount ?? 5) : 0,
      totalRounds: sim.roundCount ?? 5,
      topPrediction: topPred?.summary ?? 'Simulation completed — awaiting prediction analysis',
      predictionType: formatPredictionType(topPred?.predictionType ?? ''),
      timeHorizon: topPred?.timeHorizon ?? '',
      predictedAt: topPred?.createdAt ?? sim.createdAt,
      confidence: conf,
      factionSplit,
      agentDebate: buildDebatePosts(simPreds),
      status: sim.status,
      signalCount,
    };
  });
}

export function transformPredictions(apiResponse: unknown): PredictionTimelineData {
  const resp = apiResponse as { data?: ApiPrediction[] };
  const preds = resp.data ?? [];
  if (!Array.isArray(preds)) return { predictions: [] };

  // Cache for simulation card enrichment + faction graph
  cachedPredictions = preds;

  const points: PredictionPoint[] = preds.map((p) => ({
    id: p.id,
    simulationId: p.simulationId,
    theater: p.theater,
    predictionType: p.predictionType as PredictionPoint['predictionType'],
    summary: p.summary ?? '',
    confidence: typeof p.confidence === 'string' ? parseFloat(p.confidence) : p.confidence,
    timeHorizon: p.timeHorizon ?? '72h',
    supportingFactions: parseFactions(p.supportingFactions),
    dissentingFactions: parseFactions(p.dissentingFactions),
    createdAt: p.createdAt,
  }));

  return { predictions: points };
}

export function transformHeatmap(apiResponse: unknown): HeatmapPanelData {
  const resp = apiResponse as { data?: ApiPrediction[] };
  const preds = resp.data ?? [];
  return { predictionCount: Array.isArray(preds) ? preds.length : 0 };
}

// ── Intelligence transforms ──────────────────────────────────────────

/** Cache intelligence for signal count on theater cards */
let cachedIntelligence: IntelligenceData | null = null;

/** Get the current cached intelligence data */
export function getCachedIntelligence(): IntelligenceData | null {
  return cachedIntelligence;
}

/** Transform raw intelligence API response into typed IntelligenceData */
export function transformIntelligence(apiResponse: unknown): IntelligenceData {
  const resp = (apiResponse ?? {}) as {
    stories?: IntelStory[];
    forecasts?: IntelForecast[];
    fetchedAt?: string;
  };
  const data: IntelligenceData = {
    stories: Array.isArray(resp.stories) ? resp.stories : [],
    forecasts: Array.isArray(resp.forecasts) ? resp.forecasts : [],
    fetchedAt: resp.fetchedAt ?? new Date().toISOString(),
  };
  cachedIntelligence = data;
  return data;
}
