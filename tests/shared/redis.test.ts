import { describe, it, expect, vi, afterEach } from 'vitest';

import { createRedisClient, redis, closeRedis } from '../../src/shared/redis.js';

describe('createRedisClient', () => {
  it('should return a Redis client instance', () => {
    const client = createRedisClient('redis://localhost:6379');

    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
    expect(typeof client.set).toBe('function');
    expect(typeof client.quit).toBe('function');

    // Clean up — disconnect without waiting (lazy connect)
    client.disconnect(false);
  });

  it('should use lazyConnect so it does not connect immediately', () => {
    const client = createRedisClient('redis://localhost:9999');

    // With lazyConnect: true, the client status should be 'wait'
    // (not 'connecting' or 'connect')
    expect(client.status).toBe('wait');

    client.disconnect(false);
  });

  it('should accept a custom URL parameter', () => {
    const customUrl = 'redis://custom-host:1234';
    const client = createRedisClient(customUrl);

    // The client should have been configured with the custom host/port
    expect(client.options.host).toBe('custom-host');
    expect(client.options.port).toBe(1234);

    client.disconnect(false);
  });

  it('should configure retry strategy with exponential backoff capped at 5000ms', () => {
    const client = createRedisClient('redis://localhost:6379');

    // Access the retryStrategy from the options
    const retryStrategy = client.options.retryStrategy;
    expect(retryStrategy).toBeDefined();

    if (retryStrategy) {
      // First retry: 200ms
      expect(retryStrategy(1)).toBe(200);
      // Second retry: 400ms
      expect(retryStrategy(2)).toBe(400);
      // Large number: capped at 5000ms
      expect(retryStrategy(100)).toBe(5000);
    }

    client.disconnect(false);
  });
});

describe('redis (default client)', () => {
  it('should be a Redis client instance', () => {
    expect(redis).toBeDefined();
    expect(typeof redis.get).toBe('function');
    expect(typeof redis.set).toBe('function');
  });

  it('should be in wait status (lazyConnect)', () => {
    expect(redis.status).toBe('wait');
  });
});

describe('closeRedis', () => {
  it('should be a function', () => {
    expect(typeof closeRedis).toBe('function');
  });
});
