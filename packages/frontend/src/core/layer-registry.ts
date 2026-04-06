import type { MapLayer, MapLayerConstructor } from '../types.js';

/**
 * Map layer registration and lookup system.
 *
 * Follows WorldMonitor's pattern: layer constructors are registered by ID,
 * then instantiated when the variant loader resolves layer configurations.
 * Layers are deck.gl/globe.gl overlays (ScatterplotLayer, HeatmapLayer, etc.).
 */
export class LayerRegistry {
  private readonly constructors = new Map<string, MapLayerConstructor>();

  /** Register a layer constructor under a given ID. Overwrites existing. */
  register(id: string, ctor: MapLayerConstructor): void {
    this.constructors.set(id, ctor);
  }

  /** Remove a layer registration by ID. No-op if not registered. */
  unregister(id: string): void {
    this.constructors.delete(id);
  }

  /** Check if a layer ID is registered. */
  has(id: string): boolean {
    return this.constructors.has(id);
  }

  /** Create a new layer instance from a registered constructor. */
  create(id: string): MapLayer | undefined {
    const Ctor = this.constructors.get(id);
    if (!Ctor) return undefined;
    return new Ctor();
  }

  /** Return all registered layer IDs. */
  getAll(): string[] {
    return Array.from(this.constructors.keys());
  }

  /** Return number of registered layers. */
  size(): number {
    return this.constructors.size;
  }

  /** Remove all registrations. */
  clear(): void {
    this.constructors.clear();
  }
}
