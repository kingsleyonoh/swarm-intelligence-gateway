/**
 * Tests for the shared Redis cache helper.
 *
 * The cache layer is Redis-backed but we mock the ioredis client here so
 * these unit tests exercise caching LOGIC (hit/miss, serialization, error
 * fallback, pattern invalidation) without requiring a live Redis. The
 * predictions API integration tests exercise the full stack against the
 * real Dockerised Redis — so cache behaviour is double-covered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup (hoisted) ───────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const get = vi.fn();
  const set = vi.fn();
  const del = vi.fn();
  const scan = vi.fn();
  return { get, set, del, scan };
});

vi.mock('../../src/shared/redis.js', () => ({
  redis: {
    get: mocks.get,
    set: mocks.set,
    del: mocks.del,
    scan: mocks.scan,
  },
}));

// Silence the shared logger so failed-fetch warnings don't pollute output.
vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const child = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...child, child: vi.fn().mockReturnValue(child) },
    createChildLogger: vi.fn().mockReturnValue(child),
  };
});

// Import AFTER mocks so the module under test binds to the mocked redis.
const { getOrSet, invalidatePattern, PREDICTION_CACHE_TTL_SECONDS } = await import(
  '../../src/shared/cache.js'
);

// ── Tests ──────────────────────────────────────────────────────────────

describe('getOrSet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the cached value on a hit without calling the fetcher', async () => {
    const cached = { foo: 'bar', n: 42 };
    mocks.get.mockResolvedValue(JSON.stringify(cached));
    const fetcher = vi.fn();

    const result = await getOrSet('test:key', 60, fetcher);

    expect(result).toEqual(cached);
    expect(mocks.get).toHaveBeenCalledWith('test:key');
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('calls the fetcher on a miss and stores the result with TTL', async () => {
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue('OK');
    const fetcher = vi.fn().mockResolvedValue({ hello: 'world' });

    const result = await getOrSet('miss:key', 300, fetcher);

    expect(result).toEqual({ hello: 'world' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      'miss:key',
      JSON.stringify({ hello: 'world' }),
      'EX',
      300,
    );
  });

  it('returns the fetcher result when Redis GET throws (fail-open)', async () => {
    mocks.get.mockRejectedValue(new Error('connection refused'));
    mocks.set.mockResolvedValue('OK');
    const fetcher = vi.fn().mockResolvedValue({ fallback: true });

    const result = await getOrSet('err:key', 60, fetcher);

    expect(result).toEqual({ fallback: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns the fetcher result when Redis SET throws (fail-open)', async () => {
    mocks.get.mockResolvedValue(null);
    mocks.set.mockRejectedValue(new Error('OOM'));
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);

    const result = await getOrSet('set-err:key', 60, fetcher);

    expect(result).toEqual([1, 2, 3]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('handles arrays and nested objects through JSON round-trip', async () => {
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue('OK');
    const payload = {
      data: [{ id: 1, nested: { a: [true, null, 'x'] } }],
      nextCursor: null,
    };
    const fetcher = vi.fn().mockResolvedValue(payload);

    const result = await getOrSet('nested:key', 60, fetcher);

    expect(result).toEqual(payload);
    expect(mocks.set).toHaveBeenCalledWith(
      'nested:key',
      JSON.stringify(payload),
      'EX',
      60,
    );
  });
});

describe('invalidatePattern', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all keys matching the pattern in a single scan', async () => {
    // Single scan iteration — cursor goes from '0' back to '0'.
    mocks.scan.mockResolvedValueOnce([
      '0',
      ['predictions:latest:tenantA:mc=0.7:l=10', 'predictions:list:tenantA:c=x:l=20'],
    ]);
    mocks.del.mockResolvedValue(2);

    const deleted = await invalidatePattern('predictions:*:tenantA:*');

    expect(deleted).toBe(2);
    expect(mocks.scan).toHaveBeenCalledWith(
      '0',
      'MATCH',
      'predictions:*:tenantA:*',
      'COUNT',
      100,
    );
    expect(mocks.del).toHaveBeenCalledWith(
      'predictions:latest:tenantA:mc=0.7:l=10',
      'predictions:list:tenantA:c=x:l=20',
    );
  });

  it('iterates through multiple scan cursors until exhausted', async () => {
    mocks.scan
      .mockResolvedValueOnce(['5', ['a']])
      .mockResolvedValueOnce(['12', ['b', 'c']])
      .mockResolvedValueOnce(['0', ['d']]);
    mocks.del.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const deleted = await invalidatePattern('any:*');

    expect(deleted).toBe(4);
    expect(mocks.scan).toHaveBeenCalledTimes(3);
  });

  it('returns 0 when nothing matches the pattern', async () => {
    mocks.scan.mockResolvedValueOnce(['0', []]);

    const deleted = await invalidatePattern('no:match:*');

    expect(deleted).toBe(0);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('skips the DEL call on scan iterations that return no keys', async () => {
    mocks.scan
      .mockResolvedValueOnce(['7', []])
      .mockResolvedValueOnce(['0', ['only-one']]);
    mocks.del.mockResolvedValue(1);

    const deleted = await invalidatePattern('mixed:*');

    expect(deleted).toBe(1);
    expect(mocks.del).toHaveBeenCalledTimes(1);
    expect(mocks.del).toHaveBeenCalledWith('only-one');
  });
});

describe('PREDICTION_CACHE_TTL_SECONDS', () => {
  it('exports a 5-minute TTL constant', () => {
    expect(PREDICTION_CACHE_TTL_SECONDS).toBe(300);
  });
});
