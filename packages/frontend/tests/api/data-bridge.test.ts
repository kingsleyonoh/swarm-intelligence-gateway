import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataBridge } from '../../src/api/data-bridge.js';
import type { Panel, RefreshIntervals } from '../../src/types.js';
import type { TheaterCardData } from '../../src/components/theater-types.js';
import type { FactionGraphData } from '../../src/components/faction-types.js';

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

/** Factory: prediction API response */
function makePredictionResponse(overrides: Partial<{
  id: string;
  simulationId: string;
  theater: string;
  predictionType: string;
  summary: string;
  confidence: number;
  timeHorizon: string;
  supportingFactions: string;
  dissentingFactions: string;
  createdAt: string;
}>[] = []) {
  const defaults = {
    id: 'pred-1',
    simulationId: 'sim-1',
    theater: 'South China Sea',
    predictionType: 'escalation',
    summary: 'Naval buildup detected near contested waters',
    confidence: 0.85,
    timeHorizon: '72h',
    supportingFactions: 'Hawks,Nationalists',
    dissentingFactions: 'Moderates',
    createdAt: '2026-04-07T00:00:00Z',
  };
  const data = overrides.length > 0
    ? overrides.map((o) => ({ ...defaults, ...o }))
    : [defaults];
  return { data };
}

/** Factory: simulation API response */
function makeSimulationResponse(overrides: Partial<{
  id: string;
  scenarioId: string;
  status: string;
  agentCount: number;
  roundCount: number;
  report: string | null;
  createdAt: string;
}>[] = []) {
  const defaults = {
    id: 'sim-1',
    scenarioId: 'scen-1',
    status: 'completed',
    agentCount: 4096,
    roundCount: 5,
    report: null,
    createdAt: '2026-04-07T00:00:00Z',
  };
  const data = overrides.length > 0
    ? overrides.map((o) => ({ ...defaults, ...o }))
    : [defaults];
  return { data };
}

describe('DataBridge', () => {
  let bridge: DataBridge;
  let theaterPanel: Panel;
  let timelinePanel: Panel;
  let factionPanel: Panel;

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
    factionPanel = makeMockPanel('faction-map');

    bridge = new DataBridge({
      apiBaseUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      refreshIntervals: TEST_INTERVALS,
      panels: new Map([
        ['swarm-theater', theaterPanel],
        ['prediction-timeline', timelinePanel],
        ['faction-map', factionPanel],
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

  describe('prediction cache priming', () => {
    it('fetches predictions before starting poll loops', async () => {
      const fetchCalls: string[] = [];
      const predResponse = makePredictionResponse();
      const emptyResponse = { data: [] };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          fetchCalls.push(url);
          const isPredsUrl = url.includes('/api/predictions');
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(isPredsUrl ? predResponse : emptyResponse),
          });
        }),
      );

      bridge.startAll();
      // Wait for the priming fetch + first poll cycle
      await vi.waitFor(() => {
        expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
      });
      // First fetch should be the prediction priming call
      expect(fetchCalls[0]).toContain('/api/predictions');
    });

    it('simulation cards use primed prediction theater name', async () => {
      const predResponse = makePredictionResponse([{
        id: 'pred-1',
        simulationId: 'sim-1',
        theater: 'South China Sea',
        confidence: 0.85,
        summary: 'Naval tensions rising',
      }]);
      const simResponse = makeSimulationResponse([{
        id: 'sim-1',
        status: 'completed',
      }]);

      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          callCount++;
          const isPreds = url.includes('/api/predictions');
          const isSims = url.includes('/api/simulations');
          const response = isPreds ? predResponse : isSims ? simResponse : { data: [] };
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(response),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(theaterPanel.update).toHaveBeenCalled();
      });

      // The theater panel should receive cards with the prediction theater name
      const lastCall = (theaterPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const cards = lastCall[lastCall.length - 1][0] as TheaterCardData[];
      const card = cards.find((c) => c.id === 'sim-1');
      expect(card).toBeDefined();
      expect(card!.theater).toBe('South China Sea');
    });
  });

  describe('debate feed population', () => {
    it('populates agentDebate from cached predictions', async () => {
      const predResponse = makePredictionResponse([
        {
          id: 'pred-1',
          simulationId: 'sim-1',
          theater: 'South China Sea',
          predictionType: 'escalation',
          summary: 'Naval buildup detected',
          confidence: 0.85,
          supportingFactions: 'Hawks,Nationalists',
          createdAt: '2026-04-07T00:00:00Z',
        },
        {
          id: 'pred-2',
          simulationId: 'sim-1',
          theater: 'South China Sea',
          predictionType: 'de_escalation',
          summary: 'Diplomatic talks expected',
          confidence: 0.65,
          supportingFactions: 'Moderates',
          createdAt: '2026-04-07T01:00:00Z',
        },
      ]);
      const simResponse = makeSimulationResponse([{
        id: 'sim-1',
        status: 'completed',
      }]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const isPreds = url.includes('/api/predictions');
          const isSims = url.includes('/api/simulations');
          const response = isPreds ? predResponse : isSims ? simResponse : { data: [] };
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(response),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(theaterPanel.update).toHaveBeenCalled();
      });

      const lastCall = (theaterPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const cards = lastCall[lastCall.length - 1][0] as TheaterCardData[];
      const card = cards.find((c) => c.id === 'sim-1');
      expect(card).toBeDefined();
      expect(card!.agentDebate.length).toBeGreaterThan(0);

      // Verify debate post structure
      const post = card!.agentDebate[0];
      expect(post.agentId).toBeDefined();
      expect(post.username).toBeDefined();
      expect(post.faction).toBeDefined();
      expect(post.stanceColor).toBeDefined();
      expect(post.content).toBe('Naval buildup detected');
      expect(post.timestamp).toBeDefined();
    });

    it('debate posts use escalation stance color for escalation predictions', async () => {
      const predResponse = makePredictionResponse([{
        id: 'pred-1',
        simulationId: 'sim-1',
        predictionType: 'escalation',
        summary: 'Tensions rising',
        supportingFactions: 'Hawks',
        confidence: 0.9,
      }]);
      const simResponse = makeSimulationResponse([{ id: 'sim-1' }]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const isPreds = url.includes('/api/predictions');
          const isSims = url.includes('/api/simulations');
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(isPreds ? predResponse : isSims ? simResponse : { data: [] }),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(theaterPanel.update).toHaveBeenCalled();
      });

      const lastCall = (theaterPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const cards = lastCall[lastCall.length - 1][0] as TheaterCardData[];
      const card = cards.find((c) => c.id === 'sim-1');
      expect(card!.agentDebate[0].stanceColor).toBe('#e05252');
    });

    it('debate posts use de_escalation stance color', async () => {
      const predResponse = makePredictionResponse([{
        id: 'pred-1',
        simulationId: 'sim-1',
        predictionType: 'de_escalation',
        summary: 'Peace talks initiated',
        supportingFactions: 'Doves',
        confidence: 0.8,
      }]);
      const simResponse = makeSimulationResponse([{ id: 'sim-1' }]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const isPreds = url.includes('/api/predictions');
          const isSims = url.includes('/api/simulations');
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(isPreds ? predResponse : isSims ? simResponse : { data: [] }),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(theaterPanel.update).toHaveBeenCalled();
      });

      const lastCall = (theaterPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const cards = lastCall[lastCall.length - 1][0] as TheaterCardData[];
      const card = cards.find((c) => c.id === 'sim-1');
      expect(card!.agentDebate[0].stanceColor).toBe('#4a90d9');
    });
  });

  describe('faction map wiring', () => {
    it('updates faction-map panel when predictions arrive', async () => {
      const predResponse = makePredictionResponse([
        {
          id: 'pred-1',
          simulationId: 'sim-1',
          theater: 'South China Sea',
          predictionType: 'escalation',
          supportingFactions: 'Hawks,Nationalists',
          dissentingFactions: 'Moderates',
        },
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const isPreds = url.includes('/api/predictions');
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(isPreds ? predResponse : { data: [] }),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(factionPanel.update).toHaveBeenCalled();
      });
    });

    it('faction graph has nodes from supporting and dissenting factions', async () => {
      const predResponse = makePredictionResponse([
        {
          id: 'pred-1',
          simulationId: 'sim-1',
          predictionType: 'escalation',
          supportingFactions: 'Hawks,Nationalists',
          dissentingFactions: 'Moderates',
        },
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const isPreds = url.includes('/api/predictions');
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(isPreds ? predResponse : { data: [] }),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(factionPanel.update).toHaveBeenCalled();
      });

      const lastCall = (factionPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const graphData = lastCall[lastCall.length - 1][0] as FactionGraphData;

      expect(graphData.nodes.length).toBe(3); // Hawks, Nationalists, Moderates
      const names = graphData.nodes.map((n) => n.name).sort();
      expect(names).toEqual(['Hawks', 'Moderates', 'Nationalists']);
    });

    it('faction graph has edges between factions in same prediction', async () => {
      const predResponse = makePredictionResponse([
        {
          id: 'pred-1',
          simulationId: 'sim-1',
          predictionType: 'escalation',
          supportingFactions: 'Hawks,Nationalists',
          dissentingFactions: 'Moderates',
        },
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const isPreds = url.includes('/api/predictions');
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(isPreds ? predResponse : { data: [] }),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(factionPanel.update).toHaveBeenCalled();
      });

      const lastCall = (factionPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const graphData = lastCall[lastCall.length - 1][0] as FactionGraphData;

      // 3 factions in one prediction = 3 edges (Hawks-Nationalists, Hawks-Moderates, Nationalists-Moderates)
      expect(graphData.edges.length).toBe(3);
      for (const edge of graphData.edges) {
        expect(edge.weight).toBeGreaterThan(0);
        expect(edge.weight).toBeLessThanOrEqual(1);
      }
    });

    it('faction nodes have correct stance from prediction type', async () => {
      const predResponse = makePredictionResponse([
        {
          id: 'pred-1',
          simulationId: 'sim-1',
          predictionType: 'escalation',
          supportingFactions: 'Hawks',
          dissentingFactions: 'Doves',
        },
      ]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const isPreds = url.includes('/api/predictions');
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => Promise.resolve(isPreds ? predResponse : { data: [] }),
          });
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(factionPanel.update).toHaveBeenCalled();
      });

      const lastCall = (factionPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const graphData = lastCall[lastCall.length - 1][0] as FactionGraphData;

      const hawks = graphData.nodes.find((n) => n.name === 'Hawks');
      const doves = graphData.nodes.find((n) => n.name === 'Doves');
      expect(hawks).toBeDefined();
      expect(doves).toBeDefined();
      // Supporting faction of escalation → escalate stance
      expect(hawks!.stance).toBe('escalate');
      // Dissenting faction of escalation → de_escalate stance
      expect(doves!.stance).toBe('de_escalate');
    });

    it('faction graph is empty when no predictions exist', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({ data: [] }),
        }),
      );

      bridge.startAll();
      await vi.waitFor(() => {
        expect(factionPanel.update).toHaveBeenCalled();
      });

      const lastCall = (factionPanel.update as ReturnType<typeof vi.fn>).mock.calls;
      const graphData = lastCall[lastCall.length - 1][0] as FactionGraphData;
      expect(graphData.nodes).toEqual([]);
      expect(graphData.edges).toEqual([]);
    });
  });
});
