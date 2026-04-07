/**
 * Tests for GlobeRenderer.
 * Tests state management only — NO WebGL rendering (happy-dom has no WebGL).
 * Globe.gl is mocked to avoid WebGL initialization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { GlobeMarker } from '../../src/core/globe-types.js';

// Mock globe.gl before importing the renderer
vi.mock('globe.gl', () => {
  const mockGlobeInstance = {
    globeImageUrl: vi.fn().mockReturnThis(),
    backgroundColor: vi.fn().mockReturnThis(),
    atmosphereColor: vi.fn().mockReturnThis(),
    atmosphereAltitude: vi.fn().mockReturnThis(),
    pointsData: vi.fn().mockReturnThis(),
    pointLat: vi.fn().mockReturnThis(),
    pointLng: vi.fn().mockReturnThis(),
    pointColor: vi.fn().mockReturnThis(),
    pointAltitude: vi.fn().mockReturnThis(),
    pointRadius: vi.fn().mockReturnThis(),
    pointLabel: vi.fn().mockReturnThis(),
    ringsData: vi.fn().mockReturnThis(),
    ringLat: vi.fn().mockReturnThis(),
    ringLng: vi.fn().mockReturnThis(),
    ringColor: vi.fn().mockReturnThis(),
    ringMaxRadius: vi.fn().mockReturnThis(),
    ringPropagationSpeed: vi.fn().mockReturnThis(),
    ringRepeatPeriod: vi.fn().mockReturnThis(),
    width: vi.fn().mockReturnThis(),
    height: vi.fn().mockReturnThis(),
    pointOfView: vi.fn().mockReturnThis(),
    controls: vi.fn().mockReturnValue({
      autoRotate: false,
      autoRotateSpeed: 0,
    }),
    onGlobeReady: vi.fn().mockReturnThis(),
    scene: vi.fn().mockReturnValue({ add: vi.fn() }),
    _destructor: vi.fn(),
  };

  // Globe() returns a factory, factory(element) returns the instance (Kapsule pattern)
  const GlobeConstructor = vi.fn(() => vi.fn(() => mockGlobeInstance));

  return {
    default: GlobeConstructor,
    __mockInstance: mockGlobeInstance,
  };
});

import { GlobeRenderer } from '../../src/core/globe-renderer.js';

describe('GlobeRenderer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'globe-container';
    document.body.appendChild(container);
  });

  it('should store container reference on construction', () => {
    const renderer = new GlobeRenderer(container);
    expect(renderer).toBeDefined();
  });

  it('should report not initialized before init()', () => {
    const renderer = new GlobeRenderer(container);
    expect(renderer.isInitialized()).toBe(false);
  });

  it('should report initialized after init()', async () => {
    const renderer = new GlobeRenderer(container);
    await renderer.init();
    expect(renderer.isInitialized()).toBe(true);
  });

  it('should accept markers via updateMarkers()', async () => {
    const renderer = new GlobeRenderer(container);
    await renderer.init();

    const markers: GlobeMarker[] = [
      {
        id: 'p1',
        lat: 33.0,
        lng: 44.0,
        label: 'Middle East: escalation (85%)',
        color: '#e05252',
        size: 0.9,
      },
    ];

    // Should not throw
    renderer.updateMarkers(markers);
  });

  it('should throw if updateMarkers called before init', () => {
    const renderer = new GlobeRenderer(container);
    expect(() => renderer.updateMarkers([])).toThrow();
  });

  it('should clean up on destroy()', async () => {
    const renderer = new GlobeRenderer(container);
    await renderer.init();
    renderer.destroy();
    expect(renderer.isInitialized()).toBe(false);
  });

  it('should not throw if destroy called before init', () => {
    const renderer = new GlobeRenderer(container);
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('should handle empty markers array', async () => {
    const renderer = new GlobeRenderer(container);
    await renderer.init();
    renderer.updateMarkers([]);
  });
});
