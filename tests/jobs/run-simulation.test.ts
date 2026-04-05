import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const runSimulation = vi.fn();
  const workerOn = vi.fn();
  const workerClose = vi.fn();
  const loggerError = vi.fn();
  const loggerWarn = vi.fn();

  return { runSimulation, workerOn, workerClose, loggerError, loggerWarn };
});

// Mock BullMQ Worker — must be a class since source calls `new Worker()`
vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: unknown, _opts: unknown) {
      (mocks as any)._processor = processor;
      (mocks as any)._name = _name;
      (mocks as any)._opts = _opts;
    }
    on = mocks.workerOn;
    close = mocks.workerClose;
  },
}));

// Mock orchestrator
vi.mock('../../src/mirofish/orchestrator.js', () => ({
  runSimulation: mocks.runSimulation,
}));

// Mock logger — preserve spies on error/warn so we can assert dead-letter
// escalation and retry paths use the right log levels with full context.
vi.mock('../../src/shared/logger.js', () => {
  const childLogger = {
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
  };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Mock queue
vi.mock('../../src/shared/queue.js', () => ({
  parseRedisUrl: vi.fn().mockReturnValue({ host: 'localhost', port: 6379 }),
  QUEUE_NAMES: { RUN_SIMULATION: 'run-simulation', POLL_WORLDMONITOR: 'poll-worldmonitor' },
}));

// Mock env
vi.mock('../../src/config/env.js', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    PORT: 3000,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    POLL_INTERVAL_MINUTES: 60,
    DEFAULT_AGENT_COUNT: 4096,
    DEFAULT_ROUND_COUNT: 5,
    DATA_RETENTION_DAYS: 90,
    SELF_REGISTRATION_ENABLED: true,
    NOTIFICATION_HUB_ENABLED: false,
    DEMO_MODE: false,
  },
}));

// Import after mocks
const { createSimulationWorker } = await import('../../src/jobs/run-simulation.js');

// ── Tests ───────────────────────────────────────────────────────────

describe('createSimulationWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a BullMQ Worker for the run-simulation queue', () => {
    createSimulationWorker();

    expect((mocks as any)._name).toBe('run-simulation');
    expect((mocks as any)._processor).toBeTypeOf('function');
    expect((mocks as any)._opts).toEqual(
      expect.objectContaining({ concurrency: 1 }),
    );
  });

  it('should register a failed event handler on the worker', () => {
    createSimulationWorker();

    expect(mocks.workerOn).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('should call runSimulation with job data when processor runs', async () => {
    mocks.runSimulation.mockResolvedValue('sim-001');

    createSimulationWorker();

    const processor = (mocks as any)._processor;
    expect(processor).toBeDefined();

    const fakeJob = {
      id: 'job-1',
      data: {
        scenarioId: 'scenario-001',
        tenantId: 'tenant-001',
        agentCount: 2048,
        roundCount: 3,
        llmProvider: 'deepseek',
      },
    };

    await processor(fakeJob);

    expect(mocks.runSimulation).toHaveBeenCalledWith({
      scenarioId: 'scenario-001',
      tenantId: 'tenant-001',
      agentCount: 2048,
      roundCount: 3,
      llmProvider: 'deepseek',
    });
  });

  it('should propagate errors from runSimulation', async () => {
    mocks.runSimulation.mockRejectedValue(new Error('Pipeline failed'));

    createSimulationWorker();

    const processor = (mocks as any)._processor;
    const fakeJob = {
      id: 'job-2',
      data: { scenarioId: 's1', tenantId: 't1' },
    };

    await expect(processor(fakeJob)).rejects.toThrow('Pipeline failed');
  });

  it('should return the worker instance', () => {
    const worker = createSimulationWorker();

    expect(worker).toBeDefined();
    expect(worker).toHaveProperty('on');
    expect(worker).toHaveProperty('close');
  });

  // ── Dead letter / retry classification ─────────────────────────────

  it('should register an error event handler for worker-level failures', () => {
    createSimulationWorker();

    expect(mocks.workerOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should log non-final attempt as warn (will retry)', () => {
    createSimulationWorker();

    // Find the registered "failed" handler and invoke it directly
    const failedCall = mocks.workerOn.mock.calls.find((c) => c[0] === 'failed');
    expect(failedCall).toBeDefined();
    const failedHandler = failedCall![1] as (job: unknown, err: Error) => void;

    const fakeJob = {
      id: 'job-retry',
      attemptsMade: 1,
      opts: { attempts: 3 },
      data: { scenarioId: 'scenario-xyz', tenantId: 'tenant-xyz' },
    };

    failedHandler(fakeJob, new Error('Transient MiroFish error'));

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-retry',
        scenarioId: 'scenario-xyz',
        tenantId: 'tenant-xyz',
        attemptsMade: 1,
        attemptsTotal: 3,
        permanentFailure: false,
        error: 'Transient MiroFish error',
      }),
      expect.stringMatching(/attempt failed|will retry/i),
    );
  });

  it('should log final attempt as error with permanentFailure flag (dead letter)', () => {
    createSimulationWorker();

    const failedCall = mocks.workerOn.mock.calls.find((c) => c[0] === 'failed');
    const failedHandler = failedCall![1] as (job: unknown, err: Error) => void;

    const fakeJob = {
      id: 'job-dead',
      attemptsMade: 3,
      opts: { attempts: 3 },
      data: { scenarioId: 'scenario-abc', tenantId: 'tenant-abc' },
    };

    failedHandler(fakeJob, new Error('Pipeline exhausted retries'));

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-dead',
        scenarioId: 'scenario-abc',
        tenantId: 'tenant-abc',
        attemptsMade: 3,
        attemptsTotal: 3,
        permanentFailure: true,
        error: 'Pipeline exhausted retries',
      }),
      expect.stringMatching(/permanently failed|dead letter/i),
    );
  });
});
