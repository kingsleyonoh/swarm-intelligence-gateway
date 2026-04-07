import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createForceSimulation,
  type ForceNode,
  type ForceEdge,
} from '../../src/components/faction-force-sim.js';

function makeNodes(): ForceNode[] {
  return [
    { id: 'a', x: 100, y: 100, stance: 'escalate', memberCount: 80 },
    { id: 'b', x: 200, y: 200, stance: 'de_escalate', memberCount: 50 },
    { id: 'c', x: 300, y: 150, stance: 'neutral', memberCount: 30 },
  ];
}

function makeEdges(): ForceEdge[] {
  return [
    { source: 'a', target: 'b', weight: 0.8 },
    { source: 'b', target: 'c', weight: 0.3 },
  ];
}

describe('createForceSimulation', () => {
  let stopFn: (() => void) | null = null;

  afterEach(() => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
  });

  it('creates simulation with correct node count', () => {
    const nodes = makeNodes();
    const onTick = vi.fn();
    const result = createForceSimulation(nodes, makeEdges(), {
      width: 600,
      height: 400,
      onTick,
    });
    stopFn = result.stop;

    expect(result.simulation).toBeDefined();
    expect(result.simulation.nodes().length).toBe(3);
  });

  it('onTick callback fires during simulation', () => {
    const nodes = makeNodes();
    const onTick = vi.fn();
    const result = createForceSimulation(nodes, makeEdges(), {
      width: 600,
      height: 400,
      onTick,
    });
    stopFn = result.stop;

    // Manually tick the simulation to trigger callback
    result.tick();
    expect(onTick).toHaveBeenCalled();
  });

  it('stop() freezes simulation alpha', () => {
    const nodes = makeNodes();
    const onTick = vi.fn();
    const result = createForceSimulation(nodes, makeEdges(), {
      width: 600,
      height: 400,
      onTick,
    });

    result.stop();
    stopFn = null;

    expect(result.simulation.alpha()).toBe(0);
  });

  it('handles empty nodes gracefully', () => {
    const onTick = vi.fn();
    const result = createForceSimulation([], [], {
      width: 600,
      height: 400,
      onTick,
    });
    stopFn = result.stop;

    expect(result.simulation.nodes().length).toBe(0);
    // Should not throw
    result.tick();
  });

  it('handles nodes with no edges', () => {
    const nodes = makeNodes();
    const onTick = vi.fn();
    const result = createForceSimulation(nodes, [], {
      width: 600,
      height: 400,
      onTick,
    });
    stopFn = result.stop;

    expect(result.simulation.nodes().length).toBe(3);
    result.tick();
    expect(onTick).toHaveBeenCalled();
  });

  it('nodes have updated positions after ticking', () => {
    const nodes = makeNodes();
    const onTick = vi.fn();
    const result = createForceSimulation(nodes, makeEdges(), {
      width: 600,
      height: 400,
      onTick,
    });
    stopFn = result.stop;

    const initialPositions = nodes.map((n) => ({ x: n.x, y: n.y }));

    // Tick multiple times to allow forces to move nodes
    for (let i = 0; i < 10; i++) {
      result.tick();
    }

    // At least one node should have moved
    const hasMoved = nodes.some(
      (n, i) => n.x !== initialPositions[i].x || n.y !== initialPositions[i].y,
    );
    expect(hasMoved).toBe(true);
  });

  it('passes nodes and edges to onTick callback', () => {
    const nodes = makeNodes();
    const edges = makeEdges();
    const onTick = vi.fn();
    const result = createForceSimulation(nodes, edges, {
      width: 600,
      height: 400,
      onTick,
    });
    stopFn = result.stop;

    result.tick();

    const [tickNodes, tickEdges] = onTick.mock.calls[0];
    expect(tickNodes.length).toBe(3);
    expect(tickEdges.length).toBe(2);
  });
});
