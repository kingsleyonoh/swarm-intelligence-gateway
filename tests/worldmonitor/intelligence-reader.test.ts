import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for readIntelligence — WorldMonitor live data reader.
 *
 * WorldMonitor Redis is an EXTERNAL service — mocking ioredis is allowed.
 * The reader creates a short-lived connection, reads, then disconnects.
 */

// ── Hoisted mocks ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const redisKeys = vi.fn();
  const redisHgetall = vi.fn();
  const redisLrange = vi.fn();
  const redisQuit = vi.fn().mockResolvedValue('OK');
  const redisConnect = vi.fn().mockResolvedValue(undefined);

  return { redisKeys, redisHgetall, redisLrange, redisQuit, redisConnect };
});

vi.mock('ioredis', () => {
  class MockRedis {
    keys = mocks.redisKeys;
    hgetall = mocks.redisHgetall;
    lrange = mocks.redisLrange;
    quit = mocks.redisQuit;
    connect = mocks.redisConnect;
    disconnect = vi.fn();
    status = 'wait';
  }
  return { Redis: MockRedis };
});

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

vi.mock('../../src/config/env.js', () => ({
  env: {
    WORLDMONITOR_REDIS_URL: 'redis://worldmonitor:6382',
    REDIS_URL: 'redis://localhost:6383',
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

const { readIntelligence } = await import(
  '../../src/worldmonitor/intelligence-reader.js'
);

// ── Test data builders ───────────────────────────────────────────────

function storyHash(overrides: Record<string, string> = {}) {
  return {
    title: 'Test Story',
    link: 'https://example.com/story',
    currentScore: '85',
    severity: 'critical',
    lastSeen: '1712500000',
    ...overrides,
  };
}

function forecastHistoryEntry() {
  return JSON.stringify({
    predictions: [
      {
        id: 'pred-1',
        domain: 'geopolitical',
        region: 'Middle East',
        title: 'Escalation Risk',
        probability: 0.72,
        confidence: 0.85,
        timeHorizon: '30d',
        signals: ['signal-a', 'signal-b', 'signal-c'],
      },
      {
        id: 'pred-2',
        domain: 'economic',
        region: 'Asia Pacific',
        title: 'Trade Disruption',
        probability: 0.45,
        confidence: 0.6,
        timeHorizon: '90d',
        signals: ['signal-x'],
      },
    ],
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('readIntelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisConnect.mockResolvedValue(undefined);
  });

  it('should return stories sorted by currentScore descending', async () => {
    mocks.redisKeys.mockResolvedValue([
      'story:track:v1:aaa',
      'story:track:v1:bbb',
      'story:track:v1:ccc',
    ]);
    mocks.redisHgetall
      .mockResolvedValueOnce(storyHash({ title: 'Low', currentScore: '10' }))
      .mockResolvedValueOnce(storyHash({ title: 'High', currentScore: '99' }))
      .mockResolvedValueOnce(storyHash({ title: 'Mid', currentScore: '50' }));
    mocks.redisLrange.mockResolvedValue([]);

    const result = await readIntelligence();

    expect(result.stories).toHaveLength(3);
    expect(result.stories[0].title).toBe('High');
    expect(result.stories[0].currentScore).toBe(99);
    expect(result.stories[1].title).toBe('Mid');
    expect(result.stories[2].title).toBe('Low');
  });

  it('should return forecasts from history list', async () => {
    mocks.redisKeys.mockResolvedValue([]);
    mocks.redisLrange.mockResolvedValue([forecastHistoryEntry()]);

    const result = await readIntelligence();

    expect(result.forecasts).toHaveLength(2);
    expect(result.forecasts[0]).toEqual({
      id: 'pred-1',
      domain: 'geopolitical',
      region: 'Middle East',
      title: 'Escalation Risk',
      probability: 0.72,
      confidence: 0.85,
      timeHorizon: '30d',
      signalCount: 3,
    });
    expect(result.forecasts[1].signalCount).toBe(1);
  });

  it('should return empty arrays on connection error', async () => {
    mocks.redisConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await readIntelligence();

    expect(result.stories).toEqual([]);
    expect(result.forecasts).toEqual([]);
    expect(result.fetchedAt).toBeDefined();
  });

  it('should limit stories to 50', async () => {
    // Generate 60 story keys
    const keys = Array.from({ length: 60 }, (_, i) => `story:track:v1:s${i}`);
    mocks.redisKeys.mockResolvedValue(keys);
    // Each HGETALL returns a story with score = index (so they all differ)
    for (let i = 0; i < 60; i++) {
      mocks.redisHgetall.mockResolvedValueOnce(
        storyHash({ title: `Story ${i}`, currentScore: String(i) }),
      );
    }
    mocks.redisLrange.mockResolvedValue([]);

    const result = await readIntelligence();

    expect(result.stories).toHaveLength(50);
    // Top 50 by score: stories 59 down to 10
    expect(result.stories[0].currentScore).toBe(59);
    expect(result.stories[49].currentScore).toBe(10);
  });

  it('should include a fetchedAt ISO timestamp', async () => {
    mocks.redisKeys.mockResolvedValue([]);
    mocks.redisLrange.mockResolvedValue([]);

    const result = await readIntelligence();

    expect(result.fetchedAt).toBeDefined();
    expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
  });

  it('should disconnect Redis client after reading', async () => {
    mocks.redisKeys.mockResolvedValue([]);
    mocks.redisLrange.mockResolvedValue([]);

    await readIntelligence();

    expect(mocks.redisQuit).toHaveBeenCalled();
  });

  it('should handle empty forecast history gracefully', async () => {
    mocks.redisKeys.mockResolvedValue(['story:track:v1:a']);
    mocks.redisHgetall.mockResolvedValueOnce(storyHash());
    mocks.redisLrange.mockResolvedValue([]);

    const result = await readIntelligence();

    expect(result.forecasts).toEqual([]);
    expect(result.stories).toHaveLength(1);
  });
});
