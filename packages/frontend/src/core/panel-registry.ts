import type { Panel, PanelConstructor } from '../types.js';

/**
 * Panel registration and lookup system.
 *
 * Follows WorldMonitor's pattern: panel constructors are registered by ID,
 * then instantiated on demand when the variant loader resolves a config.
 * This decouples panel implementation from variant configuration.
 */
export class PanelRegistry {
  private readonly constructors = new Map<string, PanelConstructor>();

  /** Register a panel constructor under a given ID. Overwrites existing. */
  register(id: string, ctor: PanelConstructor): void {
    this.constructors.set(id, ctor);
  }

  /** Remove a panel registration by ID. No-op if not registered. */
  unregister(id: string): void {
    this.constructors.delete(id);
  }

  /** Check if a panel ID is registered. */
  has(id: string): boolean {
    return this.constructors.has(id);
  }

  /** Create a new panel instance from a registered constructor. */
  create(id: string): Panel | undefined {
    const Ctor = this.constructors.get(id);
    if (!Ctor) return undefined;
    return new Ctor();
  }

  /** Return all registered panel IDs. */
  getAll(): string[] {
    return Array.from(this.constructors.keys());
  }

  /** Return number of registered panels. */
  size(): number {
    return this.constructors.size;
  }

  /** Remove all registrations. */
  clear(): void {
    this.constructors.clear();
  }
}
