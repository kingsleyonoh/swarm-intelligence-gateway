import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmApiClient } from '../../src/api/client.js';
import type {
  PaginatedResponse,
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

function makeSimRow(overrides: Partial<SimulationRow> = {}): SimulationRow {
  return {
    id: 'sim-1',
    tenantId: 'tenant-1',
    scenarioId: 'scenario-1',
    status: 'completed',
    seedDocument: null,
    report: null,
    costEstimateUsd: null,
    createdAt: '2026-04-05T12:00:00Z',
    updatedAt: '2026-04-05T12:00:00Z',
    ...overrides,
  };
}

function makePredRow(overrides: Partial<PredictionRow> = {}): PredictionRow {
  return {
    id: 'pred-1',
    simulationId: 'sim-1',
    theater: 'Middle East',
    predictionType: 'escalation',
    summary: 'Tensions rising',
    confidence: 0.85,
    timeHorizon: '72h',
    supportingFactions: ['Hawks'],
    dissentingFactions: ['Doves'],
    createdAt: '2026-04-05T12:00:00Z',
    ...overrides,
  };
}

describe('SwarmApiClient', () => {
  let client: SwarmApiClient;

  beforeEach(() => {
    client = new SwarmApiClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'test-api-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSimulations', () => {
    it('calls correct URL with query params', async () => {
      const response: PaginatedResponse<SimulationRow> = {
        data: [makeSimRow()],
        nextCursor: null,
      };
      mockFetch(response);

      await client.getSimulations({ status: 'completed', limit: 5 });

      expect(fetch).toHaveBeenCalledTimes(1);
      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/api/simulations');
      expect(url).toContain('status=completed');
      expect(url).toContain('limit=5');
    });

    it('returns typed response data', async () => {
      const response: PaginatedResponse<SimulationRow> = {
        data: [makeSimRow({ id: 'sim-42' })],
        nextCursor: 'next-123',
      };
      mockFetch(response);

      const result = await client.getSimulations({});
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('sim-42');
      expect(result.nextCursor).toBe('next-123');
    });

    it('sends X-API-Key header', async () => {
      mockFetch({ data: [], nextCursor: null });

      await client.getSimulations({});

      const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(opts.headers['X-API-Key']).toBe('test-api-key');
    });
  });

  describe('getSimulationReport', () => {
    it('calls correct URL for simulation report', async () => {
      const response: SimulationReportResponse = {
        report: 'Analysis complete',
        predictions: [makePredRow()],
      };
      mockFetch(response);

      await client.getSimulationReport('sim-99');

      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/api/simulations/sim-99/report');
    });

    it('returns report and predictions', async () => {
      const response: SimulationReportResponse = {
        report: 'Full report text',
        predictions: [makePredRow({ id: 'p-5' })],
      };
      mockFetch(response);

      const result = await client.getSimulationReport('sim-1');
      expect(result.report).toBe('Full report text');
      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0].id).toBe('p-5');
    });
  });

  describe('getPredictions', () => {
    it('calls correct URL with limit param', async () => {
      mockFetch({ data: [], nextCursor: null });

      await client.getPredictions({ limit: 100 });

      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/api/predictions');
      expect(url).toContain('limit=100');
    });

    it('returns typed prediction data', async () => {
      const response: PaginatedResponse<PredictionRow> = {
        data: [makePredRow({ theater: 'Pacific' })],
        nextCursor: null,
      };
      mockFetch(response);

      const result = await client.getPredictions({});
      expect(result.data[0].theater).toBe('Pacific');
    });
  });

  describe('getLatestPredictions', () => {
    it('calls correct URL with minConfidence filter', async () => {
      mockFetch({ data: [] });

      await client.getLatestPredictions({ minConfidence: 0.7, limit: 10 });

      const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain('/api/predictions/latest');
      expect(url).toContain('minConfidence=0.7');
      expect(url).toContain('limit=10');
    });
  });

  describe('error handling', () => {
    it('throws error for non-200 response', async () => {
      mockFetch({ error: { code: 'UNAUTHORIZED' } }, 401);

      await expect(client.getSimulations({})).rejects.toThrow(
        'HTTP 401',
      );
    });

    it('throws error for 500 responses', async () => {
      mockFetch({ error: { code: 'INTERNAL' } }, 500);

      await expect(client.getPredictions({})).rejects.toThrow(
        'HTTP 500',
      );
    });
  });
});
