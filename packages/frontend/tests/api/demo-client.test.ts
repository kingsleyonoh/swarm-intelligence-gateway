import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DemoApiClient } from '../../src/api/demo-client.js';
import type {
  SimulationRow,
  PredictionRow,
  SimulationReportResponse,
} from '../../src/api/types.js';

function mockFetch(response: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(response),
    }),
  );
}

describe('DemoApiClient', () => {
  let client: DemoApiClient;

  beforeEach(() => {
    client = new DemoApiClient('/demo');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSimulations', () => {
    it('fetches from demo/simulations.json', async () => {
      const simulations: SimulationRow[] = [
        {
          id: 'sim-1',
          tenantId: 'demo',
          scenarioId: 'scn-1',
          status: 'completed',
          seedDocument: null,
          report: null,
          costEstimateUsd: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ];
      mockFetch({ data: simulations, nextCursor: null });

      const result = await client.getSimulations({});

      expect(fetch).toHaveBeenCalledTimes(1);
      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/demo/simulations.json');
    });

    it('returns paginated response shape', async () => {
      const simulations: SimulationRow[] = [
        {
          id: 'sim-demo',
          tenantId: 'demo',
          scenarioId: 'scn-1',
          status: 'completed',
          seedDocument: null,
          report: null,
          costEstimateUsd: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ];
      mockFetch({ data: simulations, nextCursor: null });

      const result = await client.getSimulations({});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('sim-demo');
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('getPredictions', () => {
    it('fetches from demo/predictions.json', async () => {
      const predictions: PredictionRow[] = [
        {
          id: 'pred-1',
          simulationId: 'sim-1',
          theater: 'Middle East',
          predictionType: 'escalation',
          summary: 'Test',
          confidence: 0.8,
          timeHorizon: '72h',
          supportingFactions: [],
          dissentingFactions: [],
          createdAt: '2026-04-01T00:00:00Z',
        },
      ];
      mockFetch({ data: predictions, nextCursor: null });

      await client.getPredictions({});

      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/demo/predictions.json');
    });

    it('returns prediction data', async () => {
      const predictions: PredictionRow[] = [
        {
          id: 'pred-demo',
          simulationId: 'sim-1',
          theater: 'Eastern Europe',
          predictionType: 'de_escalation',
          summary: 'Diplomatic progress',
          confidence: 0.7,
          timeHorizon: '7d',
          supportingFactions: ['Doves'],
          dissentingFactions: ['Hawks'],
          createdAt: '2026-04-01T00:00:00Z',
        },
      ];
      mockFetch({ data: predictions, nextCursor: null });

      const result = await client.getPredictions({});

      expect(result.data[0].id).toBe('pred-demo');
      expect(result.data[0].theater).toBe('Eastern Europe');
    });
  });

  describe('getLatestPredictions', () => {
    it('fetches from demo/predictions.json', async () => {
      mockFetch({ data: [] });

      await client.getLatestPredictions({});

      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/demo/predictions.json');
    });
  });

  describe('getSimulationReport', () => {
    it('fetches from demo/report.json', async () => {
      const report: SimulationReportResponse = {
        report: 'Demo report',
        predictions: [],
      };
      mockFetch(report);

      await client.getSimulationReport('sim-1');

      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/demo/report.json');
    });

    it('returns report and predictions', async () => {
      const report: SimulationReportResponse = {
        report: 'Full analysis report',
        predictions: [
          {
            id: 'pred-r1',
            simulationId: 'sim-1',
            theater: 'South China Sea',
            predictionType: 'escalation',
            summary: 'Naval tensions',
            confidence: 0.85,
            timeHorizon: '48h',
            supportingFactions: ['PLA Navy'],
            dissentingFactions: ['MFA'],
            createdAt: '2026-04-01T00:00:00Z',
          },
        ],
      };
      mockFetch(report);

      const result = await client.getSimulationReport('sim-1');

      expect(result.report).toBe('Full analysis report');
      expect(result.predictions).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('throws on fetch failure', async () => {
      mockFetch({}, 500);

      await expect(client.getSimulations({})).rejects.toThrow();
    });
  });
});
