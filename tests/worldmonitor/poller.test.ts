import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { SimPackage } from '../../src/worldmonitor/types.js';

/** A valid SimPackage JSON that would come from WorldMonitor Redis. */
function validSimPackageJson(): SimPackage {
  return {
    runId: 'wm-2026-04-04-001',
    timestamp: '2026-04-04T12:00:00Z',
    title: 'Middle East Tensions Escalation Analysis',
    selectedTheaters: [
      {
        label: 'Persian Gulf Shipping Routes',
        region: 'Middle East',
        route: 'Strait of Hormuz',
        commodity: 'Crude Oil',
        stateKind: 'conflict',
        rankingScore: 0.92,
      },
    ],
    entities: [
      {
        name: 'Iran Revolutionary Guard',
        class: 'state_actor',
        stance: 'aggressive',
        objectives: ['Regional dominance', 'Sanctions evasion'],
        constraints: ['International pressure'],
        relationships: [{ target: 'US Navy', type: 'OPPOSES' }],
      },
    ],
    eventSeeds: [
      {
        type: 'military_action',
        summary: 'Naval confrontation in Strait of Hormuz',
        timing: 'imminent',
        strength: 0.85,
      },
    ],
    constraints: {
      hard: ['No direct US-Iran military conflict'],
      soft: ['Oil price impact limited to 20%'],
    },
    simulationRequirement:
      'Analyze the cascading effects of a potential naval confrontation.',
  };
}

/**
 * Mock dependencies using vi.hoisted() to avoid hoisting issues.
 *
 * WorldMonitor Redis is an EXTERNAL service — mocking is allowed.
 * DB/queue are also mocked here to isolate the poller's decision logic.
 */
const mocks = vi.hoisted(() => {
  const redisGet = vi.fn();
  const redisQuit = vi.fn().mockResolvedValue('OK');
  const redisConnect = vi.fn().mockResolvedValue(undefined);
  const dbSelect = vi.fn();
  const dbInsert = vi.fn();
  const queueAdd = vi.fn();

  return { redisGet, redisQuit, redisConnect, dbSelect, dbInsert, queueAdd };
});

// Mock ioredis (external WorldMonitor Redis)
vi.mock('ioredis', () => {
  class MockRedis {
    get = mocks.redisGet;
    quit = mocks.redisQuit;
    connect = mocks.redisConnect;
    disconnect = vi.fn();
    status = 'wait';
  }
  return { Redis: MockRedis };
});

// Mock the database module
vi.mock('../../src/shared/db.js', () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
  },
}));

// Mock the queue module
vi.mock('../../src/shared/queue.js', () => ({
  simulationQueue: { add: mocks.queueAdd },
  QUEUE_NAMES: {
    RUN_SIMULATION: 'run-simulation',
    POLL_WORLDMONITOR: 'poll-worldmonitor',
  },
}));

// Mock logger to prevent output during tests, but preserve spies so we can
// assert that structured context is passed through on warn / error paths.
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../src/shared/logger.js', () => {
  const childLogger = loggerMocks;
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Mock env config
vi.mock('../../src/config/env.js', () => ({
  env: {
    WORLDMONITOR_REDIS_URL: 'redis://worldmonitor:6379',
    WORLDMONITOR_REDIS_TOKEN: undefined,
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

// Import after mocks are set up
const { pollWorldMonitor } = await import('../../src/worldmonitor/poller.js');

describe('pollWorldMonitor', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Redis connect succeeds
    mocks.redisConnect.mockResolvedValue(undefined);

    // Default: DB select returns empty (no existing scenario with this runId)
    mocks.dbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    // Default: DB insert succeeds and returns a new scenario
    mocks.dbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 'new-scenario-id-123' },
        ]),
      }),
    });

    // Default: queue add succeeds
    mocks.queueAdd.mockResolvedValue({ id: 'job-1' });
  });

  // ── New package ingested ──────────────────────────────────────────

  it('should ingest a new package when runId is not in DB', async () => {
    const pkg = validSimPackageJson();
    mocks.redisGet.mockResolvedValue(JSON.stringify(pkg));

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(true);
    expect(result.scenarioId).toBe('new-scenario-id-123');
  });

  it('should call Redis GET with the correct key', async () => {
    const pkg = validSimPackageJson();
    mocks.redisGet.mockResolvedValue(JSON.stringify(pkg));

    await pollWorldMonitor(tenantId);

    expect(mocks.redisGet).toHaveBeenCalledWith(
      'forecast:simulation-package:latest',
    );
  });

  it('should insert scenario into database on new package', async () => {
    const pkg = validSimPackageJson();
    mocks.redisGet.mockResolvedValue(JSON.stringify(pkg));

    await pollWorldMonitor(tenantId);

    expect(mocks.dbInsert).toHaveBeenCalled();
  });

  it('should emit scenario.ingested to BullMQ on new package', async () => {
    const pkg = validSimPackageJson();
    mocks.redisGet.mockResolvedValue(JSON.stringify(pkg));

    await pollWorldMonitor(tenantId);

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'scenario.ingested',
      expect.objectContaining({
        scenarioId: 'new-scenario-id-123',
        tenantId,
      }),
    );
  });

  // ── Duplicate runId skipped ───────────────────────────────────────

  it('should skip ingestion when runId already exists in DB', async () => {
    const pkg = validSimPackageJson();
    mocks.redisGet.mockResolvedValue(JSON.stringify(pkg));

    // DB returns existing scenario with this runId
    mocks.dbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: 'existing-scenario-id', worldmonitorRunId: pkg.runId },
        ]),
      }),
    });

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(false);
    expect(result.scenarioId).toBeUndefined();
    expect(mocks.dbInsert).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  // ── Redis down → log + skip ───────────────────────────────────────

  it('should return ingested=false when Redis connection fails', async () => {
    mocks.redisConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(false);
    expect(result.scenarioId).toBeUndefined();
  });

  it('should not throw when Redis is down', async () => {
    mocks.redisConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(pollWorldMonitor(tenantId)).resolves.not.toThrow();
  });

  // ── Key missing → log + skip ──────────────────────────────────────

  it('should return ingested=false when Redis key is null', async () => {
    mocks.redisGet.mockResolvedValue(null);

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(false);
    expect(result.scenarioId).toBeUndefined();
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });

  it('should return ingested=false when Redis key is empty string', async () => {
    mocks.redisGet.mockResolvedValue('');

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(false);
    expect(result.scenarioId).toBeUndefined();
  });

  // ── Invalid JSON in key ───────────────────────────────────────────

  it('should return ingested=false when Redis value is invalid JSON', async () => {
    mocks.redisGet.mockResolvedValue('not-valid-json{{{');

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(false);
  });

  // ── Invalid SimPackage shape ──────────────────────────────────────

  it('should return ingested=false when package fails validation', async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ invalid: 'data' }));

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(false);
  });

  // ── Structured error logging ──────────────────────────────────────

  it('should log tenantId and error message when poll fails unexpectedly', async () => {
    // Trigger an unexpected error inside the try block by making
    // the DB select reject (not a Redis connection failure).
    mocks.redisGet.mockResolvedValue(JSON.stringify(validSimPackageJson()));
    mocks.dbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      }),
    });

    const result = await pollWorldMonitor(tenantId);

    expect(result.ingested).toBe(false);

    // Top-level catch must include tenantId + error message for
    // multi-tenant debugging.
    const warnCalls = loggerMocks.warn.mock.calls;
    const topLevelCatchCall = warnCalls.find(
      (call) =>
        typeof call[1] === 'string' && call[1].includes('WorldMonitor poll failed'),
    );
    expect(topLevelCatchCall).toBeDefined();
    expect(topLevelCatchCall![0]).toMatchObject({
      tenantId,
      error: 'DB unreachable',
    });
  });
});
