/**
 * Demo data loader — fetches static JSON and transforms into
 * the shapes each panel expects via update().
 *
 * Bridges the gap between raw API response format (PaginatedResponse)
 * and the panel-specific data types (TheaterCardData[], FactionGraphData, etc.).
 */

import type { TheaterCardData, FactionSplitSegment, AgentDebatePost, TheaterDomain } from '../components/theater-types.js';
import type { FactionGraphData, FactionNode, FactionEdge, FactionStance } from '../components/faction-types.js';
import type { PredictionTimelineData, PredictionPoint } from '../components/prediction-types.js';
import type { HeatmapPanelData } from '../components/heatmap-types.js';
import type { Panel } from '../types.js';

/** Raw simulation row from demo JSON */
interface DemoSimulation {
  id: string;
  scenarioId: string;
  status: string;
  report: string | null;
  createdAt: string;
}

/** Raw prediction row from demo JSON */
interface DemoPrediction {
  id: string;
  simulationId: string;
  theater: string;
  predictionType: string;
  summary: string;
  confidence: number;
  timeHorizon: string;
  supportingFactions: string[];
  dissentingFactions: string[];
  createdAt: string;
}

/** Raw faction entry from report JSON */
interface DemoFaction {
  region: string;
  stance: string;
  factionName: string;
  confidence: number;
}

/** Domain inference from theater name */
function inferDomain(theater: string): TheaterDomain {
  const lower = theater.toLowerCase();
  if (lower.includes('china') || lower.includes('sea')) return 'military';
  if (lower.includes('europe')) return 'political';
  if (lower.includes('africa')) return 'supply_chain';
  if (lower.includes('middle east')) return 'conflict';
  return 'political';
}

/** Build theater cards from simulations, predictions, and factions */
function buildTheaterCards(
  _sims: DemoSimulation[],
  predictions: DemoPrediction[],
  factions: DemoFaction[],
): TheaterCardData[] {
  const theaters = new Map<string, DemoPrediction[]>();
  for (const p of predictions) {
    const list = theaters.get(p.theater) ?? [];
    list.push(p);
    theaters.set(p.theater, list);
  }

  const cards: TheaterCardData[] = [];
  for (const [theater, preds] of theaters) {
    const topPred = preds.reduce((a, b) => (a.confidence > b.confidence ? a : b));
    const theaterFactions = factions.filter((f) => f.region === theater);
    const factionSplit: FactionSplitSegment[] = theaterFactions.map((f) => ({
      stance: (f.stance as FactionSplitSegment['stance']) || 'neutral',
      label: f.factionName,
      percentage: Math.round((f.confidence / theaterFactions.reduce((s, x) => s + x.confidence, 0)) * 100),
    }));

    const debatePosts: AgentDebatePost[] = preds.slice(0, 5).map((p, i) => ({
      agentId: `agent-${i}`,
      username: (p.supportingFactions[0] ?? 'Agent').replace(/\s+/g, '_'),
      faction: p.supportingFactions[0] ?? 'Unknown',
      stanceColor: p.predictionType === 'escalation' ? '#e05252'
        : p.predictionType === 'de_escalation' ? '#4a90d9'
        : p.predictionType === 'market_shift' ? '#d4a843' : '#9b59b6',
      content: p.summary,
      timestamp: p.createdAt,
    }));

    cards.push({
      id: `theater-${theater.toLowerCase().replace(/\s+/g, '-')}`,
      theater,
      domain: inferDomain(theater),
      agentCount: 4096,
      currentRound: 5,
      totalRounds: 5,
      topPrediction: topPred.summary,
      confidence: topPred.confidence,
      factionSplit,
      agentDebate: debatePosts,
    });
  }

  return cards.sort((a, b) => b.confidence - a.confidence);
}

/** Build faction graph from report factions */
function buildFactionGraph(factions: DemoFaction[]): FactionGraphData {
  const nodes: FactionNode[] = factions.map((f, i) => ({
    id: `faction-${i}`,
    name: f.factionName,
    memberCount: Math.round(f.confidence * 1000) + 200,
    stance: (f.stance as FactionStance) || 'neutral',
    keyAgents: [`Lead-${f.factionName.split(' ')[0]}`, `Analyst-${i}`],
  }));

  const edges: FactionEdge[] = [];
  const regionGroups = new Map<string, number[]>();
  factions.forEach((f, i) => {
    const list = regionGroups.get(f.region) ?? [];
    list.push(i);
    regionGroups.set(f.region, list);
  });

  for (const indices of regionGroups.values()) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        edges.push({
          source: `faction-${indices[i]}`,
          target: `faction-${indices[j]}`,
          weight: 0.3 + Math.random() * 0.5,
        });
      }
    }
  }

  return { nodes, edges };
}

/** Build prediction timeline from raw predictions */
function buildTimeline(predictions: DemoPrediction[]): PredictionTimelineData {
  const points: PredictionPoint[] = predictions.map((p) => ({
    id: p.id,
    simulationId: p.simulationId,
    theater: p.theater,
    predictionType: p.predictionType as PredictionPoint['predictionType'],
    summary: p.summary,
    confidence: p.confidence,
    timeHorizon: p.timeHorizon,
    supportingFactions: p.supportingFactions,
    dissentingFactions: p.dissentingFactions,
    createdAt: p.createdAt,
  }));
  return { predictions: points };
}

/**
 * Load demo data from static JSON files and feed to mounted panels.
 */
export async function loadDemoData(
  panels: Map<string, Panel>,
  basePath = '/demo',
): Promise<void> {
  const base = basePath.replace(/\/$/, '');

  const [simsRes, predsRes, reportRes] = await Promise.all([
    fetch(`${base}/simulations.json`),
    fetch(`${base}/predictions.json`),
    fetch(`${base}/report.json`),
  ]);

  const simsJson = await simsRes.json() as { data: DemoSimulation[] };
  const predsJson = await predsRes.json() as { data: DemoPrediction[] };
  const reportJson = await reportRes.json() as { factions: DemoFaction[] };

  const theaterCards = buildTheaterCards(simsJson.data, predsJson.data, reportJson.factions);
  const factionGraph = buildFactionGraph(reportJson.factions);
  const timeline = buildTimeline(predsJson.data);
  const heatmapData: HeatmapPanelData = { predictionCount: predsJson.data.length };

  panels.get('swarm-theater')?.update(theaterCards);
  panels.get('faction-map')?.update(factionGraph);
  panels.get('prediction-timeline')?.update(timeline);
  panels.get('consensus-heatmap')?.update(heatmapData);

  // Notify globe of prediction data
  if (timeline.predictions.length > 0) {
    document.dispatchEvent(
      new CustomEvent('predictions-updated', { detail: timeline.predictions }),
    );
  }
}
