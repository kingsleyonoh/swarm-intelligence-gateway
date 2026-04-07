import { describe, it, expect, vi, afterEach } from 'vitest';

import { checkServiceReachable } from '../../src/api/routes/health.js';

/**
 * Tests for the MiroFish / upstream service reachability check.
 *
 * The health check should treat ANY HTTP response (including 404, 500, 302)
 * as "server is reachable" (ok). Only network-level failures (connection
 * refused, DNS failure, timeout) should report 'error'.
 *
 * This tests the exported `checkServiceReachable` function directly.
 */
describe('checkServiceReachable', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return ok when server responds with 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });

    const result = await checkServiceReachable('http://localhost:5001');
    expect(result).toBe('ok');
  });

  it('should return ok when server responds with 404 (reachable, no root handler)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 404 });

    const result = await checkServiceReachable('http://localhost:5001');
    expect(result).toBe('ok');
  });

  it('should return ok when server responds with 500 (reachable, internal error)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 500 });

    const result = await checkServiceReachable('http://localhost:5001');
    expect(result).toBe('ok');
  });

  it('should return ok when server responds with 302 redirect', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 302 });

    const result = await checkServiceReachable('http://localhost:5001');
    expect(result).toBe('ok');
  });

  it('should return error when connection is refused', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      }),
    );

    const result = await checkServiceReachable('http://localhost:5001');
    expect(result).toBe('error');
  });

  it('should return error when request times out', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );

    const result = await checkServiceReachable('http://localhost:5001');
    expect(result).toBe('error');
  });

  it('should return error when DNS resolution fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ENOTFOUND' },
      }),
    );

    const result = await checkServiceReachable('http://nonexistent.local');
    expect(result).toBe('error');
  });

  it('should use a 5-second timeout signal', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });

    await checkServiceReachable('http://localhost:5001');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5001',
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

