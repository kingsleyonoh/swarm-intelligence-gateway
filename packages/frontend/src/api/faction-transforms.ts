import type { FactionGraphData, FactionEdge, FactionNode } from '../components/faction-types.js';
import type { ApiPrediction } from './data-bridge-transforms.js';
import {
  dissentingStance,
  formatPredictionType,
  parseFactions,
  supportingStance,
} from './prediction-transform-utils.js';

function buildTheaterGraph(preds: ApiPrediction[]): FactionGraphData {
  const nodes: FactionNode[] = [];
  const edges: FactionEdge[] = [];
  const theaterMap = new Map<string, Map<string, number>>();

  for (const prediction of preds) {
    const theater = prediction.theater || 'Unknown';
    const type = prediction.predictionType || 'unknown';
    if (!theaterMap.has(theater)) theaterMap.set(theater, new Map());
    const types = theaterMap.get(theater)!;
    types.set(type, (types.get(type) ?? 0) + 1);
  }

  let index = 0;
  for (const [theater, types] of theaterMap) {
    const theaterId = `theater-${index++}`;
    nodes.push({ id: theaterId, name: theater, memberCount: 600, stance: 'neutral', keyAgents: [] });
    const typeNodeIds: string[] = [];
    for (const [type, count] of types) {
      const typeId = `type-${index++}`;
      typeNodeIds.push(typeId);
      nodes.push({
        id: typeId,
        name: formatPredictionType(type),
        memberCount: 200 + count * 150,
        stance: supportingStance(type),
        keyAgents: [],
      });
      edges.push({ source: theaterId, target: typeId, weight: 0.6 });
    }
    for (let i = 0; i < typeNodeIds.length; i++) {
      for (let j = i + 1; j < typeNodeIds.length; j++) {
        edges.push({ source: typeNodeIds[i], target: typeNodeIds[j], weight: 0.3 });
      }
    }
  }
  return { nodes, edges };
}

export function transformFactions(preds: ApiPrediction[]): FactionGraphData {
  if (preds.length === 0) return { nodes: [], edges: [] };

  const hasFactionData = preds.some((prediction) =>
    parseFactions(prediction.supportingFactions).length > 0
    || parseFactions(prediction.dissentingFactions).length > 0,
  );
  if (!hasFactionData) return buildTheaterGraph(preds);

  const factionMap = new Map<string, { stance: FactionNode['stance']; count: number }>();
  for (const prediction of preds) {
    for (const name of parseFactions(prediction.supportingFactions)) {
      if (!factionMap.has(name)) {
        factionMap.set(name, { stance: supportingStance(prediction.predictionType), count: 0 });
      }
      factionMap.get(name)!.count++;
    }
    for (const name of parseFactions(prediction.dissentingFactions)) {
      if (!factionMap.has(name)) {
        factionMap.set(name, { stance: dissentingStance(prediction.predictionType), count: 0 });
      }
      factionMap.get(name)!.count++;
    }
  }

  const nodes: FactionNode[] = [];
  let index = 0;
  for (const [name, info] of factionMap) {
    nodes.push({
      id: `faction-${index}`,
      name,
      memberCount: 200 + info.count * 100,
      stance: info.stance,
      keyAgents: [`Lead-${name.split(' ')[0]}`, `Analyst-${index}`],
    });
    index++;
  }
  return { nodes, edges: buildFactionEdges(preds, nodes) };
}

function buildFactionEdges(preds: ApiPrediction[], nodes: FactionNode[]): FactionEdge[] {
  const edges: FactionEdge[] = [];
  for (const prediction of preds) {
    const factions = [
      ...parseFactions(prediction.supportingFactions),
      ...parseFactions(prediction.dissentingFactions),
    ];
    for (let i = 0; i < factions.length; i++) {
      for (let j = i + 1; j < factions.length; j++) {
        const source = nodes.find((node) => node.name === factions[i]);
        const target = nodes.find((node) => node.name === factions[j]);
        if (!source || !target) continue;
        const exists = edges.some((edge) =>
          (edge.source === source.id && edge.target === target.id)
          || (edge.source === target.id && edge.target === source.id),
        );
        if (!exists) {
          edges.push({
            source: source.id,
            target: target.id,
            weight: 0.3 + Math.min(factions.length * 0.1, 0.5),
          });
        }
      }
    }
  }
  return edges;
}
