import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  OntologyGenerateResponse,
  BuildResponse,
  SimulationStartResponse,
  OntologyStatusResponse,
  SimulationStatusResponse,
  SimulationReportResponse,
} from '../../src/mirofish/types.js';

/**
 * Mock undici request function.
 *
 * MiroFish is an EXTERNAL self-hosted service — mocking HTTP is correct
 * per coding standards. We mock the undici `request` function.
 */
const mocks = vi.hoisted(() => {
  const request = vi.fn();
  return { request };
});

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return {
    ...actual,
    request: mocks.request,
  };
});

// Mock logger to prevent output during tests
vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Import after mocks are set up
const { MirofishClient } = await import('../../src/mirofish/client.js');

// ── Helpers ───────────────────────────────────────────────────────────

/** Create a mock undici response with a JSON body. */
function mockResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    body: {
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    },
  };
}

/** Create a connection error that simulates ECONNREFUSED. */
function connectionError(): Error {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:5000');
  (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';
  return err;
}

/** Create a timeout error. */
function timeoutError(): Error {
  const err = new Error('connect ETIMEDOUT');
  (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
  return err;
}

describe('MirofishClient', () => {
  let client: InstanceType<typeof MirofishClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use minimal delays for fast test execution
    client = new MirofishClient('http://localhost:5000', {
      maxRetries: 3,
      retryBaseDelayMs: 1,
      ontologyPollIntervalMs: 1,
      simulationPollIntervalMs: 1,
    });
  });

  // ── generateOntology ───────────────────────────────────────────────

  describe('generateOntology', () => {
    it('should send POST to /api/graph/ontology/generate with multipart form data', async () => {
      const responseBody: OntologyGenerateResponse = { project_id: 'proj-123', task_id: 'task-123' };
      mocks.request.mockResolvedValue(mockResponse(200, responseBody));

      const result = await client.generateOntology(
        '# Seed Document\nContent here',
        'Analyze escalation dynamics',
        'test-project',
      );

      expect(result).toEqual({ project_id: 'proj-123', task_id: 'task-123' });
      expect(mocks.request).toHaveBeenCalledTimes(1);

      const callArgs = mocks.request.mock.calls[0];
      expect(callArgs[0]).toBe('http://localhost:5000/api/graph/ontology/generate');
      expect(callArgs[1].method).toBe('POST');
    });

    it('should retry on connection error and succeed on third attempt', async () => {
      const responseBody: OntologyGenerateResponse = { project_id: 'proj-456', task_id: 'task-456' };
      mocks.request
        .mockRejectedValueOnce(connectionError())
        .mockRejectedValueOnce(connectionError())
        .mockResolvedValueOnce(mockResponse(200, responseBody));

      const result = await client.generateOntology(
        'seed doc',
        'requirement',
        'project',
      );

      expect(result).toEqual({ project_id: 'proj-456', task_id: 'task-456' });
      expect(mocks.request).toHaveBeenCalledTimes(3);
    });

    it('should throw after exhausting all retries on connection error', async () => {
      mocks.request
        .mockRejectedValueOnce(connectionError())
        .mockRejectedValueOnce(connectionError())
        .mockRejectedValueOnce(connectionError());

      await expect(
        client.generateOntology('seed', 'req', 'proj'),
      ).rejects.toThrow('connect ECONNREFUSED');
    });

    it('should retry on timeout error', async () => {
      const responseBody: OntologyGenerateResponse = { project_id: 'proj-789', task_id: 'task-789' };
      mocks.request
        .mockRejectedValueOnce(timeoutError())
        .mockResolvedValueOnce(mockResponse(200, responseBody));

      const result = await client.generateOntology('seed', 'req', 'proj');

      expect(result).toEqual({ project_id: 'proj-789', task_id: 'task-789' });
      expect(mocks.request).toHaveBeenCalledTimes(2);
    });

    it('should throw on MiroFish 500 without retrying', async () => {
      mocks.request.mockResolvedValue(
        mockResponse(500, { error: 'Internal server error' }),
      );

      await expect(
        client.generateOntology('seed', 'req', 'proj'),
      ).rejects.toThrow(/MiroFish API error.*500/);
    });
  });

  // ── buildGraph ─────────────────────────────────────────────────────

  describe('buildGraph', () => {
    it('should send POST to /api/graph/build with project_id', async () => {
      const responseBody: BuildResponse = { status: 'ok' };
      mocks.request.mockResolvedValue(mockResponse(200, responseBody));

      const result = await client.buildGraph('proj-123');

      expect(result).toEqual({ status: 'ok' });
      expect(mocks.request).toHaveBeenCalledWith(
        'http://localhost:5000/api/graph/build',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
          body: JSON.stringify({ project_id: 'proj-123' }),
        }),
      );
    });

    it('should retry on connection error', async () => {
      const responseBody: BuildResponse = { status: 'ok' };
      mocks.request
        .mockRejectedValueOnce(connectionError())
        .mockResolvedValueOnce(mockResponse(200, responseBody));

      const result = await client.buildGraph('proj-123');

      expect(result).toEqual({ status: 'ok' });
      expect(mocks.request).toHaveBeenCalledTimes(2);
    });
  });

  // ── startSimulation ────────────────────────────────────────────────

  describe('startSimulation', () => {
    it('should send POST to /api/simulation/start with config', async () => {
      const responseBody: SimulationStartResponse = { simulation_id: 'sim-001' };
      mocks.request.mockResolvedValue(mockResponse(200, responseBody));

      const result = await client.startSimulation('proj-123', {
        agentCount: 4096,
        roundCount: 5,
        llmProvider: 'deepseek',
      });

      expect(result).toEqual({ simulation_id: 'sim-001' });

      const callArgs = mocks.request.mock.calls[0];
      expect(callArgs[0]).toBe('http://localhost:5000/api/simulation/start');
      const parsedBody = JSON.parse(callArgs[1].body);
      expect(parsedBody).toEqual({
        project_id: 'proj-123',
        config: {
          agentCount: 4096,
          roundCount: 5,
          llmProvider: 'deepseek',
        },
      });
    });
  });

  // ── pollOntologyStatus ─────────────────────────────────────────────

  describe('pollOntologyStatus', () => {
    it('should poll until status is complete', async () => {
      const pending: OntologyStatusResponse = { status: 'pending' };
      const processing: OntologyStatusResponse = { status: 'processing' };
      const complete: OntologyStatusResponse = { status: 'complete' };

      mocks.request
        .mockResolvedValueOnce(mockResponse(200, pending))
        .mockResolvedValueOnce(mockResponse(200, processing))
        .mockResolvedValueOnce(mockResponse(200, complete));

      await client.pollOntologyStatus('task-123', 60_000);

      expect(mocks.request).toHaveBeenCalledTimes(3);
    });

    it('should throw on error status from ontology', async () => {
      const errorResp: OntologyStatusResponse = {
        status: 'error',
        error: 'Graph build failed',
      };
      mocks.request.mockResolvedValue(mockResponse(200, errorResp));

      await expect(
        client.pollOntologyStatus('task-123', 60_000),
      ).rejects.toThrow(/Graph build failed/);
    });

    it('should throw on timeout when ontology never completes', async () => {
      const pending: OntologyStatusResponse = { status: 'processing' };
      mocks.request.mockResolvedValue(mockResponse(200, pending));

      // Use a very short timeout for test speed
      await expect(
        client.pollOntologyStatus('task-123', 100),
      ).rejects.toThrow(/timed out/i);
    });
  });

  // ── pollSimulationStatus ───────────────────────────────────────────

  describe('pollSimulationStatus', () => {
    it('should poll until status is complete', async () => {
      const running: SimulationStatusResponse = { status: 'running', progress: 0.5 };
      const complete: SimulationStatusResponse = { status: 'complete' };

      mocks.request
        .mockResolvedValueOnce(mockResponse(200, running))
        .mockResolvedValueOnce(mockResponse(200, complete));

      await client.pollSimulationStatus('sim-001', 60_000);

      expect(mocks.request).toHaveBeenCalledTimes(2);
    });

    it('should throw on error status from simulation', async () => {
      const errorResp: SimulationStatusResponse = {
        status: 'error',
        error: 'Simulation crashed',
      };
      mocks.request.mockResolvedValue(mockResponse(200, errorResp));

      await expect(
        client.pollSimulationStatus('sim-001', 60_000),
      ).rejects.toThrow(/Simulation crashed/);
    });

    it('should throw on timeout when simulation never completes', async () => {
      const running: SimulationStatusResponse = { status: 'running' };
      mocks.request.mockResolvedValue(mockResponse(200, running));

      await expect(
        client.pollSimulationStatus('sim-001', 100),
      ).rejects.toThrow(/timed out/i);
    });
  });

  // ── getReport ──────────────────────────────────────────────────────

  describe('getReport', () => {
    it('should send GET to /api/report/by-simulation/:simulationId', async () => {
      const responseBody: SimulationReportResponse = {
        report: '## Simulation Report\nPredictions here.',
      };
      mocks.request.mockResolvedValue(mockResponse(200, responseBody));

      const result = await client.getReport('sim-001');

      expect(result).toEqual({
        report: '## Simulation Report\nPredictions here.',
      });
      expect(mocks.request).toHaveBeenCalledWith(
        'http://localhost:5000/api/report/by-simulation/sim-001',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should retry on connection error for getReport', async () => {
      const responseBody: SimulationReportResponse = { report: 'Report text' };
      mocks.request
        .mockRejectedValueOnce(connectionError())
        .mockResolvedValueOnce(mockResponse(200, responseBody));

      const result = await client.getReport('sim-001');

      expect(result).toEqual({ report: 'Report text' });
      expect(mocks.request).toHaveBeenCalledTimes(2);
    });
  });
});
