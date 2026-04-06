import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SmartPollLoop } from '../../src/core/smart-poll-loop.js';

describe('SmartPollLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates an instance with url and interval', () => {
    const onData = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData,
    });
    expect(loop).toBeDefined();
    expect(loop.isRunning()).toBe(false);
  });

  it('polls immediately on start', async () => {
    const mockData = { items: [1, 2, 3] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onData = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData,
    });

    loop.start();
    expect(loop.isRunning()).toBe(true);

    // Flush the immediate poll
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.any(Object));
    expect(onData).toHaveBeenCalledWith(mockData);

    loop.stop();
  });

  it('polls at the configured interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onData = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData,
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(0); // immediate poll
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000); // second poll
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000); // third poll
    expect(fetchMock).toHaveBeenCalledTimes(3);

    loop.stop();
  });

  it('stops polling on stop()', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onData = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData,
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    loop.stop();
    expect(loop.isRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(10000);
    // No more calls after stop
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls onError when fetch fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const onData = vi.fn();
    const onError = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData,
      onError,
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onData).not.toHaveBeenCalled();

    loop.stop();
  });

  it('calls onError when response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    vi.stubGlobal('fetch', fetchMock);

    const onData = vi.fn();
    const onError = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData,
      onError,
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onData).not.toHaveBeenCalled();

    loop.stop();
  });

  it('stops after maxErrors consecutive failures', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const onData = vi.fn();
    const onError = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 1000,
      onData,
      onError,
      maxErrors: 3,
    });

    loop.start();

    // First failure
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);

    // Second failure (with backoff: 1000 * 1.5 = 1500ms)
    await vi.advanceTimersByTimeAsync(1500);
    expect(onError).toHaveBeenCalledTimes(2);

    // Third failure (with backoff: 1500 * 1.5 = 2250ms) — triggers stop
    await vi.advanceTimersByTimeAsync(2250);
    expect(onError).toHaveBeenCalledTimes(3);
    expect(loop.isRunning()).toBe(false);

    // No more calls even after waiting
    await vi.advanceTimersByTimeAsync(10000);
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('resets error count on successful poll', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error('Temporary error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'recovered' }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const onData = vi.fn();
    const onError = vi.fn();
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 1000,
      onData,
      onError,
      maxErrors: 5,
    });

    loop.start();

    // First failure
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);

    // Second failure (backoff: 1500ms)
    await vi.advanceTimersByTimeAsync(1500);
    expect(onError).toHaveBeenCalledTimes(2);

    // Third call succeeds (backoff: 2250ms) — resets error count
    await vi.advanceTimersByTimeAsync(2250);
    expect(onData).toHaveBeenCalledWith({ data: 'recovered' });

    loop.stop();
  });

  it('passes custom fetch options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const headers = { 'X-API-Key': 'test-key' };
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData: vi.fn(),
      fetchOptions: { headers },
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ headers })
    );

    loop.stop();
  });

  it('start() is a no-op if already running', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData: vi.fn(),
    });

    loop.start();
    loop.start(); // second call — no-op
    await vi.advanceTimersByTimeAsync(0);

    // Only one immediate poll, not two
    expect(fetchMock).toHaveBeenCalledTimes(1);

    loop.stop();
  });

  it('stop() is a no-op if not running', () => {
    const loop = new SmartPollLoop({
      url: '/api/test',
      intervalMs: 5000,
      onData: vi.fn(),
    });

    // Should not throw
    expect(() => loop.stop()).not.toThrow();
  });
});
