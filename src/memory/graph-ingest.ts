import { createChildLogger } from '../shared/logger.js';

import { upsertEdge, upsertNode } from './graph-store.js';
import type { MirofishGraphData } from '../mirofish/types.js';

const log = createChildLogger({ module: 'graph-ingest' });

export interface GraphIngestResult {
  nodes: number;
  edges: number;
}

/** Mirrors MiroFish graph output into the gateway-owned PostgreSQL graph. */
export async function storeMirofishGraph(
  tenantId: string,
  simulationId: string,
  graph: MirofishGraphData,
): Promise<GraphIngestResult> {
  const nodeIds = new Map<string, string>();
  const nodeResults = await Promise.all(graph.nodes.map(async (node) => {
    if (!node.uuid || !node.name) return false;
    const id = await upsertNode({
      tenantId,
      simulationId,
      entityId: node.uuid,
      entityType: node.labels?.[0] ?? 'Entity',
      name: node.name,
      properties: {
        summary: node.summary ?? '',
        attributes: node.attributes ?? {},
        sourceGraphId: graph.graphId,
      },
    });
    nodeIds.set(node.uuid, id);
    return true;
  }));

  const edgeResults = await Promise.all(graph.edges.map(async (edge) => {
    const sourceNodeId = nodeIds.get(edge.source_node_uuid);
    const targetNodeId = nodeIds.get(edge.target_node_uuid);
    if (!sourceNodeId || !targetNodeId || !edge.name) return false;
    await upsertEdge({
      tenantId,
      simulationId,
      sourceNodeId,
      targetNodeId,
      edgeType: edge.fact_type ?? edge.name,
      properties: {
        fact: edge.fact ?? '',
        attributes: edge.attributes ?? {},
        sourceGraphId: graph.graphId,
      },
    });
    return true;
  }));

  const result = {
    nodes: nodeResults.filter(Boolean).length,
    edges: edgeResults.filter(Boolean).length,
  };
  log.info({ tenantId, simulationId, ...result }, 'Mirrored MiroFish graph into PostgreSQL');
  return result;
}
