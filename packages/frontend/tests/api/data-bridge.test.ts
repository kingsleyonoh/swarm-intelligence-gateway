import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataBridge } from '../../src/api/data-bridge.js';
import type { Panel, RefreshIntervals } from '../../src/types.js';

/** Minimal mock panel */
function makeMockPanel(id: string): Panel {
  return {
    id,
    title: id,
    mount: vi.fn(),
    unmount: vi.fn(),
    update: vi.fn(),
  };
}

const TEST_INTERVALS: RefreshIntervals = {
  simulations: 30_000,
  predictions: 60_000,
  factions: 60_000,
  heatmap: 120_000,
};

describe('DataBridge', () => {
  let bridge: DataBridge;
  let theaterPanel: Panel;
  let timelinePanel: Panel;
  let heatmapPanel: Panel;

  beforeEach(() => {
    // Mock fetch globally so SmartPollLoop can use it
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ data: [], nextCursor: null }),
      }),
    );

    theaterPanel = makeMockPanel('swarm-theater');
    timelinePanel = makeMockPanel('prediction-timeline');
    heatmapPanel = makeMockPanel('consensus-heatmap');

    bridge = new DataBridge({
      apiBaseUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      refreshIntervals: TEST_INTERVALS,
      panels: new Map([
        ['swarm-theater', theaterPanel],
        ['prediction-timeline', timelinePanel],
        ['consensus-heatmap', heatmapPanel],
      ]),
    });
  });

  afterEach(() => {
    bridge.stopAll();
    vi.restoreAllMocks();
  });

  describe('lifecycle', () => {
    it('creates DataBridge instance', () => {
      expect(bridge).toBeDefined();
    });

    it('starts all poll loops', () => {
      bridge.startAll();
      expect(bridge.isRunning()).toBe(true);
    });

    it('stops all poll loops', () => {
      bridge.startAll();
      bridge.stopAll();
      expect(bridge.isRunning()).toBe(false);
    });

    it('stopAll is safe to call when not started', () => {
      expect(() => bridge.stopAll()).not.toThrow();
    });
  });

  describe('data routing', () => {
    it('routes simulation data to swarm-theater panel', async () => {
      const simData = {
        data: [{ id: 'sim-1', status: 'completed' }],
        nextCursor: null,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(simData),
        }),
      );

      bridge.startAll();
      // Let the poll tick
      await vi.waitFor(() => {
        expect(theaterPanel.update).toHaveBeenCalled();
      });
    });

    it('routes prediction data to prediction-timeline panel', async () => {
      const predData = {
        data: [{ id: 'pred-1', theater: 'Pacific' }],
        nextCursor: null,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(predData),
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(timelinePanel.update).toHaveBeenCalled();
      });
    });

    it('routes heatmap data to consensus-heatmap panel', async () => {
      const heatData = { data: [{ id: 'pred-1' }] };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(heatData),
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(heatmapPanel.update).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('handles API errors without crashing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({ error: 'fail' }),
        }),
      );

      bridge.startAll();
      // Give time for poll to fire and error to be handled
      await new Promise((r) => setTimeout(r, 100));
      // No throw — bridge should remain functional
      expect(bridge.isRunning()).toBe(true);
    });

    it('handles fetch rejection without crashing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error')),
      );

      bridge.startAll();
      await new Promise((r) => setTimeout(r, 100));
      // Still running (backoff, not dead)
      expect(bridge.isRunning()).toBe(true);
    });
  });
});
