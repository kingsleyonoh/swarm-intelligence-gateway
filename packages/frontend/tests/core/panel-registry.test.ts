import { describe, it, expect, beforeEach } from 'vitest';

import { PanelRegistry } from '../../src/core/panel-registry.js';
import type { Panel, PanelConstructor } from '../../src/types.js';

/** Minimal test panel implementation */
class TestPanel implements Panel {
  readonly id = 'test-panel';
  readonly title = 'Test Panel';
  mounted = false;
  unmounted = false;
  lastData: unknown = null;

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = this.id;
    container.appendChild(el);
    this.mounted = true;
  }

  unmount(): void {
    this.unmounted = true;
  }

  update(data: unknown): void {
    this.lastData = data;
  }
}

class AnotherPanel implements Panel {
  readonly id = 'another-panel';
  readonly title = 'Another Panel';

  mount(_container: HTMLElement): void {
    /* noop for test */
  }

  unmount(): void {
    /* noop for test */
  }

  update(_data: unknown): void {
    /* noop for test */
  }
}

describe('PanelRegistry', () => {
  let registry: PanelRegistry;

  beforeEach(() => {
    registry = new PanelRegistry();
  });

  it('starts with zero registered panels', () => {
    expect(registry.size()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it('registers a panel constructor by id', () => {
    registry.register('test-panel', TestPanel as PanelConstructor);
    expect(registry.has('test-panel')).toBe(true);
    expect(registry.size()).toBe(1);
  });

  it('creates a panel instance from registered constructor', () => {
    registry.register('test-panel', TestPanel as PanelConstructor);
    const instance = registry.create('test-panel');
    expect(instance).toBeDefined();
    expect(instance!.id).toBe('test-panel');
    expect(instance!.title).toBe('Test Panel');
  });

  it('returns undefined for unregistered panel id', () => {
    const instance = registry.create('nonexistent');
    expect(instance).toBeUndefined();
  });

  it('registers multiple panels', () => {
    registry.register('test-panel', TestPanel as PanelConstructor);
    registry.register('another-panel', AnotherPanel as PanelConstructor);
    expect(registry.size()).toBe(2);
    expect(registry.has('test-panel')).toBe(true);
    expect(registry.has('another-panel')).toBe(true);
  });

  it('returns all registered panel ids', () => {
    registry.register('test-panel', TestPanel as PanelConstructor);
    registry.register('another-panel', AnotherPanel as PanelConstructor);
    const ids = registry.getAll();
    expect(ids).toContain('test-panel');
    expect(ids).toContain('another-panel');
  });

  it('overwrites previous registration for same id', () => {
    registry.register('test-panel', TestPanel as PanelConstructor);
    registry.register('test-panel', AnotherPanel as PanelConstructor);
    expect(registry.size()).toBe(1);
    const instance = registry.create('test-panel');
    expect(instance).toBeDefined();
    // After overwrite, the constructor is AnotherPanel
    expect(instance!.id).toBe('another-panel');
  });

  it('unregisters a panel by id', () => {
    registry.register('test-panel', TestPanel as PanelConstructor);
    expect(registry.has('test-panel')).toBe(true);
    registry.unregister('test-panel');
    expect(registry.has('test-panel')).toBe(false);
    expect(registry.size()).toBe(0);
  });

  it('unregister is a no-op for unknown id', () => {
    registry.unregister('nonexistent');
    expect(registry.size()).toBe(0);
  });

  it('clears all registrations', () => {
    registry.register('test-panel', TestPanel as PanelConstructor);
    registry.register('another-panel', AnotherPanel as PanelConstructor);
    registry.clear();
    expect(registry.size()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });
});
