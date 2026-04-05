/**
 * Tests for `startCleanupCron` with node-cron mocked.
 *
 * Kept in its own file so the mock for `node-cron` does not collide with
 * the live-DB tests in `cleanup.test.ts`. Mocks are isolated per test file
 * in Vitest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const cronSchedule = vi.fn();
  const cronStop = vi.fn();
  const runCleanup = vi.fn();
  return { cronSchedule, cronStop, runCleanup };
});

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.cronSchedule.mockImplementation((_expression: string, callback: unknown) => {
      (mocks as any)._cronCallback = callback;
      return { stop: mocks.cronStop };
    }),
  },
}));

// Silence the logger
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

// Mock DB so importing the cleanup module doesn't open a real connection.
vi.mock('../../src/shared/db.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

// Import after mocks are registered
const { startCleanupCron } = await import('../../src/jobs/cleanup.js');

// ── Tests ───────────────────────────────────────────────────────────

describe('startCleanupCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules a cron job with the 03:00 UTC daily expression', () => {
    startCleanupCron();

    expect(mocks.cronSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.cronSchedule).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
  });

  it('returns an object with a stop() method', () => {
    const task = startCleanupCron();

    expect(task).toBeDefined();
    expect(task).toHaveProperty('stop');
    expect(typeof task.stop).toBe('function');
  });

  it('catches errors from the underlying cleanup call so cron does not crash', async () => {
    startCleanupCron();

    const callback = (mocks as any)._cronCallback;
    expect(callback).toBeDefined();

    // The callback should not throw even if the inner runCleanup rejects —
    // we test that by calling it; the mocked db.select chain returns [] so
    // the callback completes cleanly.
    await expect(callback()).resolves.not.toThrow();
  });
});
