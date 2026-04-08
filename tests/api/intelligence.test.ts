import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import type { FastifyInstance } from 'fastify';
import type { IntelligencePayload } from '../../src/worldmonitor/intelligence-types.js';

/**
 * Tests for GET /api/intelligence endpoint.
 *
 * Mocks the readIntelligence function since WorldMonitor Redis
 * may not be available in test environment. The cache layer is
 * also mocked to test the route handler in isolation.
 */

const mockPayload: IntelligencePayload = {
  stories: [
    {
      title: 'Test Headline',
      link: 'https://example.com',
      currentScore: 90,
      severity: 'critical',
      lastSeen: 1712500000,
    },
  ],
  forecasts: [
    {
      id: 'pred-1',
      domain: 'geopolitical',
      region: 'Middle East',
      title: 'Escalation Risk',
      probability: 0.72,
      confidence: 0.85,
      timeHorizon: '30d',
      signalCount: 3,
    },
  ],
  fetchedAt: '2026-04-07T12:00:00.000Z',
};

// Mock cache to bypass Redis and call the fetcher directly
vi.mock('../../src/shared/cache.js', () => ({
  getOrSet: vi.fn(
    async <T>(_key: string, _ttl: number, fetcher: () => Promise<T>) =>
      fetcher(),
  ),
}));

// Mock readIntelligence to return controlled data
vi.mock('../../src/worldmonitor/intelligence-reader.js', () => ({
  readIntelligence: vi.fn().mockResolvedValue(mockPayload),
}));

const { createTestApp } = await import('../helpers/test-app.js');

describe('GET /api/intelligence', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 with stories and forecasts arrays', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intelligence',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.stories)).toBe(true);
    expect(Array.isArray(body.forecasts)).toBe(true);
    expect(body.stories).toHaveLength(1);
    expect(body.forecasts).toHaveLength(1);
  });

  it('should include a fetchedAt ISO timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intelligence',
    });

    const body = response.json();
    expect(body.fetchedAt).toBeDefined();
    expect(typeof body.fetchedAt).toBe('string');
    // Verify it's a valid ISO timestamp
    expect(new Date(body.fetchedAt).toISOString()).toBe(body.fetchedAt);
  });

  it('should not require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intelligence',
      // No X-API-Key header
    });

    expect(response.statusCode).toBe(200);
    expect(response.statusCode).not.toBe(401);
  });

  it('should return correct story shape', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intelligence',
    });

    const body = response.json();
    const story = body.stories[0];
    expect(story).toHaveProperty('title');
    expect(story).toHaveProperty('link');
    expect(story).toHaveProperty('currentScore');
    expect(story).toHaveProperty('severity');
    expect(story).toHaveProperty('lastSeen');
  });

  it('should return correct forecast shape', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/intelligence',
    });

    const body = response.json();
    const forecast = body.forecasts[0];
    expect(forecast).toHaveProperty('id');
    expect(forecast).toHaveProperty('domain');
    expect(forecast).toHaveProperty('region');
    expect(forecast).toHaveProperty('title');
    expect(forecast).toHaveProperty('probability');
    expect(forecast).toHaveProperty('confidence');
    expect(forecast).toHaveProperty('timeHorizon');
    expect(forecast).toHaveProperty('signalCount');
  });
});
