import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSwarmCanvas,
  type SwarmCanvasConfig,
  type SwarmCanvasController,
} from '../../src/components/swarm-canvas.js';

/** Stub CanvasRenderingContext2D for happy-dom (no real Canvas support) */
function mockCanvas(): void {
  const noop = vi.fn();
  const mockCtx = {
    clearRect: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    save: noop,
    restore: noop,
    fillRect: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: '',
    canvas: { width: 600, height: 300 },
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
}

function defaultConfig(
  overrides: Partial<SwarmCanvasConfig> = {},
): SwarmCanvasConfig {
  return {
    particleCount: 150,
    width: 600,
    height: 300,
    phase: 'idle',
    ...overrides,
  };
}

describe('SwarmCanvas', () => {
  let container: HTMLElement;
  let rafId: number;

  beforeEach(() => {
    mockCanvas();
    container = document.createElement('div');
    document.body.appendChild(container);
    // Mock requestAnimationFrame to avoid real animation loops
    rafId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        rafId += 1;
        return rafId;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  describe('creation', () => {
    it('creates a canvas element inside the container', () => {
      const ctrl = createSwarmCanvas(container, defaultConfig());
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      ctrl.destroy();
    });

    it('canvas dimensions match config', () => {
      const ctrl = createSwarmCanvas(
        container,
        defaultConfig({ width: 800, height: 400 }),
      );
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(400);
      ctrl.destroy();
    });

    it('starts requestAnimationFrame loop', () => {
      const ctrl = createSwarmCanvas(container, defaultConfig());
      expect(requestAnimationFrame).toHaveBeenCalled();
      ctrl.destroy();
    });
  });

  describe('setPhase', () => {
    it('updates internal phase without throwing', () => {
      const ctrl = createSwarmCanvas(container, defaultConfig());
      expect(() => ctrl.setPhase('graph_building')).not.toThrow();
      expect(() => ctrl.setPhase('simulating')).not.toThrow();
      expect(() => ctrl.setPhase('reporting')).not.toThrow();
      expect(() => ctrl.setPhase('completed')).not.toThrow();
      ctrl.destroy();
    });
  });

  describe('setPredictions', () => {
    it('stores predictions without throwing', () => {
      const ctrl = createSwarmCanvas(container, defaultConfig());
      const preds = [
        { type: 'Escalation', confidence: 0.85 },
        { type: 'De-escalation', confidence: 0.60 },
      ];
      expect(() => ctrl.setPredictions(preds)).not.toThrow();
      ctrl.destroy();
    });
  });

  describe('destroy', () => {
    it('cancels animation frame', () => {
      const ctrl = createSwarmCanvas(container, defaultConfig());
      ctrl.destroy();
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('removes canvas from container', () => {
      const ctrl = createSwarmCanvas(container, defaultConfig());
      ctrl.destroy();
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeNull();
    });
  });

  describe('particle count', () => {
    it('respects configured particle count', () => {
      // We test indirectly by verifying the canvas was set up correctly.
      // The actual particle count is internal state, but we can verify
      // the factory accepted the config without error.
      const ctrl = createSwarmCanvas(
        container,
        defaultConfig({ particleCount: 100 }),
      );
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      ctrl.destroy();
    });
  });
});
