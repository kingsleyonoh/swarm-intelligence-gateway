import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const pollWorldMonitor = vi.fn();
  const cronSchedule = vi.fn();
  const cronStop = vi.fn();

  return { pollWorldMonitor, cronSchedule, cronStop };
});

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.cronSchedule.mockImplementation((_expression: string, _callback: unknown) => {
      // Store the callback so tests can invoke it
      (mocks as any)._cronCallback = _callback;
      return { stop: mocks.cronStop };
    }),
  },
}));

// Mock poller
vi.mock('../../src/worldmonitor/poller.js', () => ({
  pollWorldMonitor: mocks.pollWorldMonitor,
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
const { startPollerCron } = await import('../../src/jobs/poll-worldmonitor.js');

// ── Tests ───────────────────────────────────────────────────────────

describe('startPollerCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should schedule a cron job with correct interval expression', () => {
    startPollerCron('tenant-001');

    expect(mocks.cronSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.cronSchedule).toHaveBeenCalledWith(
      '*/60 * * * *',
      expect.any(Function),
    );
  });

  it('should return a cron task with stop method', () => {
    const task = startPollerCron('tenant-001');

    expect(task).toBeDefined();
    expect(task).toHaveProperty('stop');
  });

  it('should call pollWorldMonitor with the default tenant ID when triggered', async () => {
    mocks.pollWorldMonitor.mockResolvedValue({ ingested: false });

    startPollerCron('tenant-001');

    const callback = (mocks as any)._cronCallback;
    expect(callback).toBeDefined();

    await callback();

    expect(mocks.pollWorldMonitor).toHaveBeenCalledWith('tenant-001');
  });

  it('should handle successful ingestion from pollWorldMonitor', async () => {
    mocks.pollWorldMonitor.mockResolvedValue({ ingested: true, scenarioId: 'scenario-xyz' });

    startPollerCron('tenant-001');

    const callback = (mocks as any)._cronCallback;
    await callback();

    expect(mocks.pollWorldMonitor).toHaveBeenCalledTimes(1);
  });

  it('should catch errors from pollWorldMonitor and not throw', async () => {
    mocks.pollWorldMonitor.mockRejectedValue(new Error('Redis connection failed'));

    startPollerCron('tenant-001');

    const callback = (mocks as any)._cronCallback;

    // Should not throw — errors are caught and logged
    await expect(callback()).resolves.not.toThrow();
  });

  it('should not re-throw poll errors (skip on failure, retry next cycle)', async () => {
    mocks.pollWorldMonitor.mockRejectedValue(new Error('Network error'));

    startPollerCron('tenant-001');

    const callback = (mocks as any)._cronCallback;

    // First call fails
    await callback();
    // Second call succeeds
    mocks.pollWorldMonitor.mockResolvedValue({ ingested: false });
    await callback();

    expect(mocks.pollWorldMonitor).toHaveBeenCalledTimes(2);
  });
});
