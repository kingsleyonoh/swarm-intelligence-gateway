import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { SimPackage } from '../../src/worldmonitor/types.js';
import { SIMULATION_STATUS } from '../../src/config/constants.js';

// ── Mock Setup ──────────────────────────────────────────────────────

/** Test scenario that matches the SimPackage shape stored as JSONB. */
function testScenario() {
  return {
    id: 'scenario-001',
    tenantId: 'tenant-001',
    worldmonitorRunId: 'wm-2026-04-04-001',
    title: 'Middle East Escalation Analysis',
    theaters: [
      {
        label: 'Persian Gulf',
        region: 'Middle East',
        route: 'Strait of Hormuz',
        stateKind: 'conflict',
        rankingScore: 0.92,
      },
    ],
    entities: [
      {
        name: 'Iran Revolutionary Guard',
        class: 'state_actor',
        stance: 'aggressive',
        objectives: ['Regional dominance'],
        constraints: ['International pressure'],
        relationships: [{ target: 'US Navy', type: 'OPPOSES' }],
      },
    ],
    eventSeeds: [
      {
        type: 'military_action',
        summary: 'Naval confrontation',
        timing: 'imminent',
        strength: 0.85,
      },
    ],
    constraints: {
      hard: ['No direct conflict'],
      soft: ['Oil price capped'],
    },
    simulationRequirement: 'Analyze cascading effects of naval confrontation.',
    source: 'poller',
    rawPackage: null,
    createdAt: new Date('2026-04-04T12:00:00Z'),
  };
}

const mocks = vi.hoisted(() => {
  // MiroFish client mock
  const generateOntology = vi.fn();
  const pollTask = vi.fn();
  const buildGraph = vi.fn();
  const createSimulation = vi.fn();
  const prepareSimulation = vi.fn();
  const pollPrepareStatus = vi.fn();
  const startSimulation = vi.fn();
  const pollSimulationStatus = vi.fn();
  const getReport = vi.fn();

  // DB mock
  const dbSelect = vi.fn();
  const dbInsert = vi.fn();
  const dbUpdate = vi.fn();

  return {
    generateOntology,
    pollTask,
    buildGraph,
    createSimulation,
    prepareSimulation,
    pollPrepareStatus,
    startSimulation,
    pollSimulationStatus,
    getReport,
    dbSelect,
    dbInsert,
    dbUpdate,
  };
});

// Mock MiroFish client — use a class so `new MirofishClient()` works
vi.mock('../../src/mirofish/client.js', () => ({
  MirofishClient: class MockMirofishClient {
    generateOntology = mocks.generateOntology;
    pollTask = mocks.pollTask;
    buildGraph = mocks.buildGraph;
    createSimulation = mocks.createSimulation;
    prepareSimulation = mocks.prepareSimulation;
    pollPrepareStatus = mocks.pollPrepareStatus;
    startSimulation = mocks.startSimulation;
    pollSimulationStatus = mocks.pollSimulationStatus;
    getReport = mocks.getReport;
  },
}));

// Mock DB module
vi.mock('../../src/shared/db.js', () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
    update: mocks.dbUpdate,
  },
}));

// Mock logger
vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Mock env
vi.mock('../../src/config/env.js', () => ({
  env: {
    MIROFISH_API_URL: 'http://localhost:5000',
    DEFAULT_AGENT_COUNT: 4096,
    DEFAULT_ROUND_COUNT: 5,
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    PORT: 3000,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    POLL_INTERVAL_MINUTES: 60,
    DATA_RETENTION_DAYS: 90,
    SELF_REGISTRATION_ENABLED: true,
    NOTIFICATION_HUB_ENABLED: false,
    DEMO_MODE: false,
  },
}));

// Import after mocks
const { runSimulation } = await import('../../src/mirofish/orchestrator.js');

// ── Test Helpers ────────────────────────────────────────────────────

/**
 * Configure standard DB mocks for a successful pipeline run.
 *
 * The orchestrator makes two select() calls:
 * 1. Load scenario by ID → returns the test scenario
 * 2. Check for existing simulation → returns empty array (no duplicate)
 *
 * Then insert() for creating the simulation record, and update() for
 * status transitions.
 */
function setupSuccessfulDbMocks() {
  const scenario = testScenario();
  let selectCallCount = 0;

  // select() is called twice: (1) scenario lookup, (2) existing sim check
  mocks.dbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount % 2 === 1) {
          // Odd calls: scenario lookup → return the scenario
          return Promise.resolve([scenario]);
        }
        // Even calls: existing simulation check → return empty (no duplicate)
        return Promise.resolve([]);
      }),
    }),
  }));

  // insert simulation → returns new ID
  mocks.dbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'sim-001' }]),
    }),
  });

  // update simulation status
  mocks.dbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ id: 'sim-001' }]),
    }),
  });
}

/** Configure MiroFish client mocks for a fully successful pipeline. */
function setupSuccessfulMirofishMocks() {
  mocks.generateOntology.mockResolvedValue({ data: { project_id: 'mf-proj-001' }, success: true });
  mocks.buildGraph.mockResolvedValue({ data: { task_id: 'build-task-001', project_id: 'mf-proj-001', message: 'ok' }, success: true });
  mocks.pollTask.mockResolvedValue(undefined);
  mocks.createSimulation.mockResolvedValue({ data: { simulation_id: 'mf-sim-001', status: 'created' }, success: true });
  mocks.prepareSimulation.mockResolvedValue({ success: true });
  mocks.pollPrepareStatus.mockResolvedValue(undefined);
  mocks.startSimulation.mockResolvedValue({ success: true });
  mocks.pollSimulationStatus.mockResolvedValue(undefined);
  mocks.getReport.mockResolvedValue({
    report: `## Simulation Report

### Predictions

**Prediction 1: Escalation**
- Theater: Persian Gulf
- Type: escalation
- Summary: Naval tensions will escalate within 72 hours
- Confidence: 0.85
- Time Horizon: 72h
- Supporting Factions: Iran Revolutionary Guard
- Dissenting Factions: US Navy

**Prediction 2: Market Shift**
- Theater: Persian Gulf
- Type: market_shift
- Summary: Oil prices will spike 15% within one week
- Confidence: 0.72
- Time Horizon: 7d
- Supporting Factions: OPEC
- Dissenting Factions: IEA`,
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('runSimulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulDbMocks();
    setupSuccessfulMirofishMocks();
  });

  // ── Full pipeline success ────────────────────────────────────────

  describe('full pipeline success', () => {
    it('should return a simulation ID on successful pipeline', async () => {
      const result = await runSimulation({
        scenarioId: 'scenario-001',
        tenantId: 'tenant-001',
      });

      expect(result).toBe('sim-001');
    });

    it('should call generateOntology with seed document content', async () => {
      await runSimulation({
        scenarioId: 'scenario-001',
        tenantId: 'tenant-001',
      });

      expect(mocks.generateOntology).toHaveBeenCalledTimes(1);
      const args = mocks.generateOntology.mock.calls[0];
      // First arg is the seed document markdown
      expect(args[0]).toContain('Middle East Escalation Analysis');
    });

    it('should call buildGraph after ontology generation (no polling needed)', async () => {
      await runSimulation({
        scenarioId: 'scenario-001',
        tenantId: 'tenant-001',
      });

      expect(mocks.buildGraph).toHaveBeenCalledWith('mf-proj-001');
    });

    it('should create then start simulation with config', async () => {
      await runSimulation({
        scenarioId: 'scenario-001',
        tenantId: 'tenant-001',
        agentCount: 2048,
        roundCount: 3,
      });

      expect(mocks.createSimulation).toHaveBeenCalledWith('mf-proj-001');
      expect(mocks.startSimulation).toHaveBeenCalledWith(
        'mf-sim-001',
        expect.objectContaining({
          agentCount: 2048,
          roundCount: 3,
        }),
      );
    });

    it('should call getReport after simulation completes', async () => {
      await runSimulation({
        scenarioId: 'scenario-001',
        tenantId: 'tenant-001',
      });

      expect(mocks.getReport).toHaveBeenCalledWith('mf-sim-001');
    });

    it('should update simulation status through the pipeline phases', async () => {
      await runSimulation({
        scenarioId: 'scenario-001',
        tenantId: 'tenant-001',
      });

      // Verify update was called multiple times for status transitions
      expect(mocks.dbUpdate).toHaveBeenCalled();
      const updateCalls = mocks.dbUpdate.mock.results;
      expect(updateCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Graph build timeout ──────────────────────────────────────────

  describe('graph build failure', () => {
    it('should set status to failed on buildGraph error', async () => {
      mocks.buildGraph.mockRejectedValue(
        new Error('Graph build failed: 500'),
      );

      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow(/graph build failed/i);

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it('should not proceed to simulation phase on graph build failure', async () => {
      mocks.buildGraph.mockRejectedValue(
        new Error('Graph build failed'),
      );

      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow();

      expect(mocks.startSimulation).not.toHaveBeenCalled();
    });
  });

  // ── Simulation timeout ───────────────────────────────────────────

  describe('simulation timeout', () => {
    it('should set status to failed on simulation poll timeout', async () => {
      mocks.pollSimulationStatus.mockRejectedValue(
        new Error('Simulation timed out after 1800000ms'),
      );

      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow(/timed out/i);

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it('should not proceed to report phase on simulation timeout', async () => {
      mocks.pollSimulationStatus.mockRejectedValue(
        new Error('Simulation timed out'),
      );

      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow();

      expect(mocks.getReport).not.toHaveBeenCalled();
    });
  });

  // ── MiroFish 500 ────────────────────────────────────────────────

  describe('MiroFish 500 error', () => {
    it('should set status to failed and store error message on MiroFish 500', async () => {
      mocks.generateOntology.mockRejectedValue(
        new Error('MiroFish API error: 500 — Internal server error'),
      );

      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow(/MiroFish API error.*500/);

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it('should capture error from simulation start failure', async () => {
      mocks.startSimulation.mockRejectedValue(
        new Error('MiroFish API error: 500 — Simulation engine crashed'),
      );

      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow(/MiroFish API error.*500/);
    });
  });

  // ── Duplicate scenario → 409 ─────────────────────────────────────

  describe('duplicate scenario conflict', () => {
    it('should throw ConflictError when simulation already exists for scenario', async () => {
      // DB select for existing simulation returns a match
      let selectCallCount = 0;
      mocks.dbSelect.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // First call: scenario lookup — return the scenario
              return Promise.resolve([testScenario()]);
            }
            // Second call: check for existing simulation — return match
            return Promise.resolve([{ id: 'existing-sim-001', status: 'completed' }]);
          }),
        }),
      }));

      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow(/already exists|conflict/i);
    });
  });

  // ── Scenario not found ───────────────────────────────────────────

  describe('scenario not found', () => {
    it('should throw NotFoundError when scenario does not exist', async () => {
      mocks.dbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        runSimulation({
          scenarioId: 'nonexistent',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  // ── Failure path preserves original error ────────────────────────

  describe('catch block resilience', () => {
    it('should propagate the original pipeline error even if failSimulation DB write fails', async () => {
      // Pipeline error — MiroFish 500 on the very first call
      mocks.generateOntology.mockRejectedValue(
        new Error('MiroFish API error: 500 — engine down'),
      );

      // In-try updates succeed; failSimulation (the LAST update call)
      // rejects to simulate a DB outage during cleanup. Before
      // generateOntology throws, the orchestrator already issued:
      //   1) updateSimulationStatus(GRAPH_BUILDING)
      //   2) updateSimulationStatus(GRAPH_BUILDING, { seedDocument })
      // then generateOntology rejects, then
      //   3) failSimulation(...)  ← this one must fail in the test
      let updateCallCount = 0;
      mocks.dbUpdate.mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            updateCallCount++;
            // Fail only the failSimulation write (3rd and later calls)
            if (updateCallCount >= 3) {
              return Promise.reject(new Error('DB connection lost'));
            }
            return Promise.resolve([{ id: 'sim-001' }]);
          }),
        }),
      }));

      // The orchestrator must re-throw the ORIGINAL error, not the
      // masking DB error from failSimulation.
      await expect(
        runSimulation({
          scenarioId: 'scenario-001',
          tenantId: 'tenant-001',
        }),
      ).rejects.toThrow(/MiroFish API error.*500/);
    });
  });
});
