/**
 * Tests for globe type exports.
 * Verifies that GlobeMarker and GlobeArc interfaces are importable
 * and usable for type-safe object construction.
 */

import { describe, it, expect } from 'vitest';

import type { GlobeMarker, GlobeArc } from '../../src/core/globe-types.js';

describe('GlobeMarker type', () => {
  it('should allow creating a valid GlobeMarker object', () => {
    const marker: GlobeMarker = {
      id: 'test-1',
      lat: 33.0,
      lng: 44.0,
      label: 'Baghdad',
      color: '#e05252',
      size: 0.5,
    };
    expect(marker.id).toBe('test-1');
    expect(marker.lat).toBe(33.0);
    expect(marker.lng).toBe(44.0);
    expect(marker.label).toBe('Baghdad');
    expect(marker.color).toBe('#e05252');
    expect(marker.size).toBe(0.5);
  });

  it('should allow optional pulseSpeed', () => {
    const marker: GlobeMarker = {
      id: 'test-2',
      lat: 10.0,
      lng: 20.0,
      label: 'Test',
      color: '#fff',
      size: 1.0,
      pulseSpeed: 2.0,
    };
    expect(marker.pulseSpeed).toBe(2.0);
  });
});

describe('GlobeArc type', () => {
  it('should allow creating a valid GlobeArc object', () => {
    const arc: GlobeArc = {
      startLat: 33.0,
      startLng: 44.0,
      endLat: 25.0,
      endLng: 55.0,
      color: '#B5652B',
    };
    expect(arc.startLat).toBe(33.0);
    expect(arc.startLng).toBe(44.0);
    expect(arc.endLat).toBe(25.0);
    expect(arc.endLng).toBe(55.0);
    expect(arc.color).toBe('#B5652B');
  });

  it('should allow optional stroke', () => {
    const arc: GlobeArc = {
      startLat: 0,
      startLng: 0,
      endLat: 10,
      endLng: 10,
      color: '#fff',
      stroke: 2.5,
    };
    expect(arc.stroke).toBe(2.5);
  });
});
