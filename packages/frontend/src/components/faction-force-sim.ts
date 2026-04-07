/**
 * Faction Force Simulation — wraps D3 force simulation for faction nodes.
 *
 * Provides physics-based layout: linked factions attract, opposing stances
 * repel more strongly, and node collision is sized by member count.
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationLinkDatum,
} from 'd3';

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  stance: string;
  memberCount: number;
}

export interface ForceEdge {
  source: string | ForceNode;
  target: string | ForceNode;
  weight: number;
}

export interface ForceSimConfig {
  width: number;
  height: number;
  onTick: (nodes: ForceNode[], edges: ForceEdge[]) => void;
}

export interface ForceSimResult {
  simulation: Simulation<ForceNode, ForceEdge>;
  stop: () => void;
  /** Advance one tick and call onTick callback */
  tick: () => void;
}

/** Minimum collision radius */
const MIN_COLLISION = 18;

/** Collision radius per member (scaled) */
const COLLISION_SCALE = 0.02;

/** Base charge for many-body force */
const BASE_CHARGE = -200;

/** Extra repulsion for opposing stances */
const OPPOSING_CHARGE = -400;

/** Stances that oppose each other */
const OPPOSING_PAIRS = new Set(['escalate:de_escalate', 'de_escalate:escalate']);

/**
 * Create a D3 force simulation for faction nodes.
 * Returns the simulation and a stop function.
 */
export function createForceSimulation(
  nodes: ForceNode[],
  edges: ForceEdge[],
  config: ForceSimConfig,
): ForceSimResult {
  const linkForce = forceLink<ForceNode, SimulationLinkDatum<ForceNode> & ForceEdge>(
    edges as (SimulationLinkDatum<ForceNode> & ForceEdge)[],
  )
    .id((d) => d.id)
    .distance((d) => {
      const e = d as unknown as ForceEdge;
      // Stronger weight = closer together (inverse relationship)
      return 80 + (1 - e.weight) * 120;
    });

  const chargeForce = forceManyBody<ForceNode>().strength((d) => {
    // Check if this node's stance opposes any neighbor
    for (const edge of edges) {
      const srcId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const tgtId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      if (srcId === d.id || tgtId === d.id) {
        const otherId = srcId === d.id ? tgtId : srcId;
        const other = nodes.find((n) => n.id === otherId);
        if (other) {
          const pair = `${d.stance}:${other.stance}`;
          if (OPPOSING_PAIRS.has(pair)) return OPPOSING_CHARGE;
        }
      }
    }
    return BASE_CHARGE;
  });

  const centerForce = forceCenter<ForceNode>(
    config.width / 2,
    config.height / 2,
  );

  const collideForce = forceCollide<ForceNode>((d) =>
    MIN_COLLISION + d.memberCount * COLLISION_SCALE,
  );

  const simulation = forceSimulation<ForceNode>(nodes)
    .force('link', linkForce)
    .force('charge', chargeForce)
    .force('center', centerForce)
    .force('collide', collideForce)
    .stop(); // Don't auto-run — caller controls via tick()

  const tick = (): void => {
    simulation.tick();
    config.onTick(nodes, edges);
  };

  const stop = (): void => {
    simulation.stop();
    simulation.alpha(0);
  };

  return { simulation, stop, tick };
}
