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
import type { FactionGraphData, FactionNode, FactionEdge, FactionStance } from '../components/faction-types.js';

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

/** Map prediction type to stance color (matches theater-helpers STANCE_COLORS) */
function stanceColorFromType(predictionType: string): string {
  if (predictionType === 'escalation') return '#e05252';
  if (predictionType === 'de_escalation') return '#4a90d9';
  if (predictionType === 'market_shift') return '#d4a843';
  return '#9b59b6';
}

/** Infer supporting faction stance from prediction type */
function supportingStance(predictionType: string): FactionStance {
  if (predictionType === 'escalation') return 'escalate';
  if (predictionType === 'de_escalation') return 'de_escalate';
  return 'uncertain';
}

/** Infer dissenting faction stance (opposite of supporting) */
function dissentingStance(predictionType: string): FactionStance {
  if (predictionType === 'escalation') return 'de_escalate';
  if (predictionType === 'de_escalation') return 'escalate';
  return 'uncertain';
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
    const factions = p.supportingFactions
      ? p.supportingFactions.split(',').map((s) => s.trim())
      : [];
    const faction = factions[0] ?? 'Unknown';
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
      agentDebate: buildDebatePosts(simPreds),
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
    supportingFactions: p.supportingFactions ? p.supportingFactions.split(',').map((s: string) => s.trim()) : [],
    dissentingFactions: p.dissentingFactions ? p.dissentingFactions.split(',').map((s: string) => s.trim()) : [],
    createdAt: p.createdAt,
  }));

  return { predictions: points };
}

/** Derive faction graph data from predictions */
export function transformFactions(preds: ApiPrediction[]): FactionGraphData {
  if (preds.length === 0) return { nodes: [], edges: [] };

  const factionMap = new Map<string, { stance: FactionStance; count: number }>();

  for (const pred of preds) {
    const supporting = pred.supportingFactions
      ? pred.supportingFactions.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const dissenting = pred.dissentingFactions
      ? pred.dissentingFactions.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    for (const name of supporting) {
      if (!factionMap.has(name)) {
        factionMap.set(name, { stance: supportingStance(pred.predictionType), count: 0 });
      }
      factionMap.get(name)!.count++;
    }
    for (const name of dissenting) {
      if (!factionMap.has(name)) {
        factionMap.set(name, { stance: dissentingStance(pred.predictionType), count: 0 });
      }
      factionMap.get(name)!.count++;
    }
  }

  const nodes: FactionNode[] = [];
  let idx = 0;
  for (const [name, info] of factionMap) {
    nodes.push({
      id: `faction-${idx}`,
      name,
      memberCount: 200 + info.count * 100,
      stance: info.stance,
      keyAgents: [`Lead-${name.split(' ')[0]}`, `Analyst-${idx}`],
    });
    idx++;
  }

  const edges: FactionEdge[] = buildFactionEdges(preds, nodes);
  return { nodes, edges };
}

/** Build edges between factions that co-occur in predictions */
function buildFactionEdges(preds: ApiPrediction[], nodes: FactionNode[]): FactionEdge[] {
  const edges: FactionEdge[] = [];
  for (const pred of preds) {
    const allFactions: string[] = [];
    if (pred.supportingFactions) {
      allFactions.push(...pred.supportingFactions.split(',').map((s) => s.trim()).filter(Boolean));
    }
    if (pred.dissentingFactions) {
      allFactions.push(...pred.dissentingFactions.split(',').map((s) => s.trim()).filter(Boolean));
    }
    for (let i = 0; i < allFactions.length; i++) {
      for (let j = i + 1; j < allFactions.length; j++) {
        const sourceNode = nodes.find((n) => n.name === allFactions[i]);
        const targetNode = nodes.find((n) => n.name === allFactions[j]);
        if (sourceNode && targetNode) {
          const exists = edges.some(
            (e) => (e.source === sourceNode.id && e.target === targetNode.id)
              || (e.source === targetNode.id && e.target === sourceNode.id),
          );
          if (!exists) {
            edges.push({
              source: sourceNode.id,
              target: targetNode.id,
              weight: 0.3 + Math.min(allFactions.length * 0.1, 0.5),
            });
          }
        }
      }
    }
  }
  return edges;
}

export function transformHeatmap(apiResponse: unknown): HeatmapPanelData {
  const resp = apiResponse as { data?: ApiPrediction[] };
  const preds = resp.data ?? [];
  return { predictionCount: Array.isArray(preds) ? preds.length : 0 };
}
