/**
 * Tests for intelligence data transform functions.
 * Validates mapping, missing field handling, and bad data resilience.
 */

import { describe, it, expect } from 'vitest';
import { transformIntelligence } from '../../src/api/data-bridge-transforms.js';

describe('transformIntelligence', () => {
  it('maps a valid API response correctly', () => {
    const result = transformIntelligence({
      stories: [
        { title: 'Test story', link: 'https://example.com', currentScore: 80, severity: 'critical', lastSeen: 1000 },
      ],
      forecasts: [
        { id: 'f-1', domain: 'conflict', region: 'Middle East', title: 'Forecast', probability: 0.7, confidence: 0.8, timeHorizon: '72h', signalCount: 3 },
      ],
      fetchedAt: '2026-04-07T12:00:00Z',
    });

    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].title).toBe('Test story');
    expect(result.stories[0].severity).toBe('critical');
    expect(result.forecasts).toHaveLength(1);
    expect(result.forecasts[0].id).toBe('f-1');
    expect(result.forecasts[0].region).toBe('Middle East');
    expect(result.fetchedAt).toBe('2026-04-07T12:00:00Z');
  });

  it('handles missing stories field', () => {
    const result = transformIntelligence({
      forecasts: [],
      fetchedAt: '2026-04-07T12:00:00Z',
    });

    expect(result.stories).toEqual([]);
  });

  it('handles missing forecasts field', () => {
    const result = transformIntelligence({
      stories: [],
      fetchedAt: '2026-04-07T12:00:00Z',
    });

    expect(result.forecasts).toEqual([]);
  });

  it('handles missing fetchedAt with fallback to ISO string', () => {
    const result = transformIntelligence({
      stories: [],
      forecasts: [],
    });

    // Should be a valid ISO date string
    expect(result.fetchedAt).toBeDefined();
    expect(() => new Date(result.fetchedAt)).not.toThrow();
  });

  it('returns empty arrays for non-array stories', () => {
    const result = transformIntelligence({
      stories: 'not-an-array',
      forecasts: [],
    });

    expect(result.stories).toEqual([]);
  });

  it('returns empty arrays for non-array forecasts', () => {
    const result = transformIntelligence({
      stories: [],
      forecasts: 42,
    });

    expect(result.forecasts).toEqual([]);
  });

  it('handles completely empty/null input', () => {
    const result = transformIntelligence({});
    expect(result.stories).toEqual([]);
    expect(result.forecasts).toEqual([]);
    expect(result.fetchedAt).toBeDefined();
  });

  it('handles null input', () => {
    const result = transformIntelligence(null);
    expect(result.stories).toEqual([]);
    expect(result.forecasts).toEqual([]);
  });
});
