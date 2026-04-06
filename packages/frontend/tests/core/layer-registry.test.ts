import { describe, it, expect, beforeEach } from 'vitest';

import { LayerRegistry } from '../../src/core/layer-registry.js';
import type { MapLayer, MapLayerConstructor } from '../../src/types.js';

/** Minimal test layer implementation */
class TestLayer implements MapLayer {
  readonly id = 'test-layer';
  readonly type = 'scatterplot';
  created = false;
  destroyed = false;
  lastData: unknown = null;

  create(data: unknown): unknown {
    this.created = true;
    this.lastData = data;
    return { type: 'scatterplot', data };
  }

  update(data: unknown): void {
    this.lastData = data;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class AnotherLayer implements MapLayer {
  readonly id = 'another-layer';
  readonly type = 'heatmap';

  create(_data: unknown): unknown {
    return { type: 'heatmap' };
  }

  update(_data: unknown): void {
    /* noop for test */
  }

  destroy(): void {
    /* noop for test */
  }
}

describe('LayerRegistry', () => {
  let registry: LayerRegistry;

  beforeEach(() => {
    registry = new LayerRegistry();
  });

  it('starts with zero registered layers', () => {
    expect(registry.size()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it('registers a layer constructor by id', () => {
    registry.register('test-layer', TestLayer as MapLayerConstructor);
    expect(registry.has('test-layer')).toBe(true);
    expect(registry.size()).toBe(1);
  });

  it('creates a layer instance from registered constructor', () => {
    registry.register('test-layer', TestLayer as MapLayerConstructor);
    const instance = registry.create('test-layer');
    expect(instance).toBeDefined();
    expect(instance!.id).toBe('test-layer');
    expect(instance!.type).toBe('scatterplot');
  });

  it('returns undefined for unregistered layer id', () => {
    const instance = registry.create('nonexistent');
    expect(instance).toBeUndefined();
  });

  it('registers multiple layers', () => {
    registry.register('test-layer', TestLayer as MapLayerConstructor);
    registry.register('another-layer', AnotherLayer as MapLayerConstructor);
    expect(registry.size()).toBe(2);
    expect(registry.has('test-layer')).toBe(true);
    expect(registry.has('another-layer')).toBe(true);
  });

  it('returns all registered layer ids', () => {
    registry.register('test-layer', TestLayer as MapLayerConstructor);
    registry.register('another-layer', AnotherLayer as MapLayerConstructor);
    const ids = registry.getAll();
    expect(ids).toContain('test-layer');
    expect(ids).toContain('another-layer');
  });

  it('overwrites previous registration for same id', () => {
    registry.register('test-layer', TestLayer as MapLayerConstructor);
    registry.register('test-layer', AnotherLayer as MapLayerConstructor);
    expect(registry.size()).toBe(1);
    const instance = registry.create('test-layer');
    expect(instance).toBeDefined();
    expect(instance!.type).toBe('heatmap');
  });

  it('unregisters a layer by id', () => {
    registry.register('test-layer', TestLayer as MapLayerConstructor);
    registry.unregister('test-layer');
    expect(registry.has('test-layer')).toBe(false);
    expect(registry.size()).toBe(0);
  });

  it('unregister is a no-op for unknown id', () => {
    registry.unregister('nonexistent');
    expect(registry.size()).toBe(0);
  });

  it('clears all registrations', () => {
    registry.register('test-layer', TestLayer as MapLayerConstructor);
    registry.register('another-layer', AnotherLayer as MapLayerConstructor);
    registry.clear();
    expect(registry.size()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });
});
