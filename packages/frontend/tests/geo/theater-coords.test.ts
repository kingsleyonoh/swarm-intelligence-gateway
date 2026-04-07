/**
 * Tests for theater-to-coordinates mapping.
 * Verifies exact match, substring match, case-insensitivity,
 * unknown theater handling, and coordinate validity.
 */

import { describe, it, expect } from 'vitest';

import {
  resolveTheaterCoords,
  THEATER_COORDS,
} from '../../src/geo/theater-coords.js';

describe('THEATER_COORDS', () => {
  it('should contain at least 20 theater entries', () => {
    const keys = Object.keys(THEATER_COORDS);
    expect(keys.length).toBeGreaterThanOrEqual(20);
  });

  it('should have valid latitude values for all theaters (-90 to 90)', () => {
    for (const [name, coords] of Object.entries(THEATER_COORDS)) {
      expect(coords.lat).toBeGreaterThanOrEqual(-90);
      expect(coords.lat).toBeLessThanOrEqual(90);
    }
  });

  it('should have valid longitude values for all theaters (-180 to 180)', () => {
    for (const [name, coords] of Object.entries(THEATER_COORDS)) {
      expect(coords.lng).toBeGreaterThanOrEqual(-180);
      expect(coords.lng).toBeLessThanOrEqual(180);
    }
  });
});

describe('resolveTheaterCoords', () => {
  it('should resolve exact match for Middle East', () => {
    const result = resolveTheaterCoords('Middle East');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeTypeOf('number');
    expect(result!.lng).toBeTypeOf('number');
  });

  it('should resolve exact match for South China Sea', () => {
    const result = resolveTheaterCoords('South China Sea');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeGreaterThan(0);
    expect(result!.lng).toBeGreaterThan(100);
  });

  it('should be case-insensitive', () => {
    const lower = resolveTheaterCoords('middle east');
    const upper = resolveTheaterCoords('MIDDLE EAST');
    const mixed = resolveTheaterCoords('Middle East');
    expect(lower).toEqual(upper);
    expect(upper).toEqual(mixed);
  });

  it('should match substring — "hormuz" matches Strait of Hormuz', () => {
    const result = resolveTheaterCoords('hormuz');
    expect(result).not.toBeNull();
  });

  it('should match substring — "china sea" matches South China Sea', () => {
    const result = resolveTheaterCoords('china sea');
    expect(result).not.toBeNull();
  });

  it('should match substring — "taiwan" matches Taiwan Strait', () => {
    const result = resolveTheaterCoords('taiwan');
    expect(result).not.toBeNull();
  });

  it('should return null for unknown theater', () => {
    const result = resolveTheaterCoords('Atlantis');
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = resolveTheaterCoords('');
    expect(result).toBeNull();
  });

  it('should resolve all 20 required theaters', () => {
    const requiredTheaters = [
      'Middle East',
      'Strait of Hormuz',
      'Asia-Pacific',
      'Eastern Europe',
      'South China Sea',
      'Taiwan Strait',
      'Black Sea',
      'Horn of Africa',
      'Persian Gulf',
      'Baltic States',
      'Arctic',
      'Korean Peninsula',
      'Sahel',
      'Indo-Pacific',
      'West Africa',
      'Central Asia',
      'Mediterranean',
      'Caucasus',
      'Red Sea',
      'Gulf of Aden',
    ];

    for (const theater of requiredTheaters) {
      const result = resolveTheaterCoords(theater);
      expect(result).not.toBeNull();
    }
  });
});
