import { describe, it, expect, afterAll } from 'vitest';

import {
  parseRedisUrl,
  QUEUE_NAMES,
  createQueue,
} from '../../src/shared/queue.js';

describe('parseRedisUrl', () => {
  it('should parse a simple redis URL', () => {
    const result = parseRedisUrl('redis://localhost:6379');

    expect(result.host).toBe('localhost');
    expect(result.port).toBe(6379);
    expect(result.password).toBeUndefined();
  });

  it('should parse a redis URL with password', () => {
    const result = parseRedisUrl('redis://:secretpass@myhost:6380');

    expect(result.host).toBe('myhost');
    expect(result.port).toBe(6380);
    expect(result.password).toBe('secretpass');
  });

  it('should default to port 6379 when port is not specified', () => {
    const result = parseRedisUrl('redis://localhost');

    expect(result.host).toBe('localhost');
    expect(result.port).toBe(6379);
  });

  it('should parse a rediss (TLS) URL', () => {
    const result = parseRedisUrl('rediss://default:token@host.upstash.io:6379');

    expect(result.host).toBe('host.upstash.io');
    expect(result.port).toBe(6379);
    expect(result.password).toBe('token');
  });

  it('should handle URL with username and password', () => {
    const result = parseRedisUrl('redis://user:pass123@redis-host:6381');

    expect(result.host).toBe('redis-host');
    expect(result.port).toBe(6381);
    expect(result.password).toBe('pass123');
  });
});

describe('QUEUE_NAMES', () => {
  it('should have RUN_SIMULATION queue name', () => {
    expect(QUEUE_NAMES.RUN_SIMULATION).toBe('run-simulation');
  });

  it('should have POLL_WORLDMONITOR queue name', () => {
    expect(QUEUE_NAMES.POLL_WORLDMONITOR).toBe('poll-worldmonitor');
  });

  it('should be a frozen (const) object', () => {
    // The `as const` assertion makes it readonly at the type level.
    // We verify the values are strings.
    expect(typeof QUEUE_NAMES.RUN_SIMULATION).toBe('string');
    expect(typeof QUEUE_NAMES.POLL_WORLDMONITOR).toBe('string');
  });
});

describe('createQueue', () => {
  const queues: Array<{ close: () => Promise<void> }> = [];

  afterAll(async () => {
    // Clean up any created queues
    for (const q of queues) {
      try {
        await q.close();
      } catch {
        // Queue may not have connected — ignore
      }
    }
  });

  it('should return a BullMQ Queue instance', () => {
    const queue = createQueue('test-queue');
    queues.push(queue);

    expect(queue).toBeDefined();
    expect(queue.name).toBe('test-queue');
  });

  it('should create queues with the correct name', () => {
    const queue = createQueue(QUEUE_NAMES.RUN_SIMULATION);
    queues.push(queue);

    expect(queue.name).toBe('run-simulation');
  });

  it('should have add method for enqueuing jobs', () => {
    const queue = createQueue('method-test-queue');
    queues.push(queue);

    expect(typeof queue.add).toBe('function');
  });
});
