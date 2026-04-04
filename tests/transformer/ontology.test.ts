import { describe, it, expect } from 'vitest';

import { extractOntologyHints } from '../../src/transformer/ontology.js';
import type { Entity } from '../../src/worldmonitor/types.js';

/** Helper to create test entities. */
function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    name: 'Test Entity',
    class: 'state_actor',
    stance: 'neutral',
    objectives: [],
    constraints: [],
    relationships: [],
    ...overrides,
  };
}

describe('extractOntologyHints', () => {
  // ── Entity class → PascalCase mapping ─────────────────────────────

  it('should convert snake_case entity class to PascalCase', () => {
    const entities = [makeEntity({ class: 'state_actor' })];
    const result = extractOntologyHints(entities);

    expect(result.entityTypes).toContain('StateActor');
  });

  it('should convert single-word entity class to PascalCase', () => {
    const entities = [makeEntity({ class: 'military' })];
    const result = extractOntologyHints(entities);

    expect(result.entityTypes).toContain('Military');
  });

  it('should convert multi-segment snake_case to PascalCase', () => {
    const entities = [makeEntity({ class: 'non_state_armed_group' })];
    const result = extractOntologyHints(entities);

    expect(result.entityTypes).toContain('NonStateArmedGroup');
  });

  it('should deduplicate entity types', () => {
    const entities = [
      makeEntity({ class: 'state_actor' }),
      makeEntity({ class: 'state_actor' }),
      makeEntity({ class: 'military' }),
    ];
    const result = extractOntologyHints(entities);

    expect(result.entityTypes).toHaveLength(2);
    expect(result.entityTypes).toContain('StateActor');
    expect(result.entityTypes).toContain('Military');
  });

  it('should sort entity types alphabetically', () => {
    const entities = [
      makeEntity({ class: 'military' }),
      makeEntity({ class: 'state_actor' }),
      makeEntity({ class: 'corporation' }),
    ];
    const result = extractOntologyHints(entities);

    expect(result.entityTypes).toEqual(['Corporation', 'Military', 'StateActor']);
  });

  // ── Edge type inference ───────────────────────────────────────────

  it('should extract edge types from entity relationships', () => {
    const entities = [
      makeEntity({
        relationships: [
          { target: 'Target A', type: 'ALLIED_WITH' },
          { target: 'Target B', type: 'OPPOSES' },
        ],
      }),
    ];
    const result = extractOntologyHints(entities);

    expect(result.edgeTypes).toContain('ALLIED_WITH');
    expect(result.edgeTypes).toContain('OPPOSES');
  });

  it('should deduplicate edge types', () => {
    const entities = [
      makeEntity({
        relationships: [
          { target: 'A', type: 'ALLIED_WITH' },
          { target: 'B', type: 'ALLIED_WITH' },
        ],
      }),
      makeEntity({
        relationships: [
          { target: 'C', type: 'OPPOSES' },
        ],
      }),
    ];
    const result = extractOntologyHints(entities);

    expect(result.edgeTypes).toHaveLength(2);
    expect(result.edgeTypes).toContain('ALLIED_WITH');
    expect(result.edgeTypes).toContain('OPPOSES');
  });

  it('should sort edge types alphabetically', () => {
    const entities = [
      makeEntity({
        relationships: [
          { target: 'A', type: 'TRADES_WITH' },
          { target: 'B', type: 'COMMANDS' },
          { target: 'C', type: 'ALLIED_WITH' },
          { target: 'D', type: 'OPPOSES' },
        ],
      }),
    ];
    const result = extractOntologyHints(entities);

    expect(result.edgeTypes).toEqual([
      'ALLIED_WITH',
      'COMMANDS',
      'OPPOSES',
      'TRADES_WITH',
    ]);
  });

  it('should handle entities with no relationships', () => {
    const entities = [
      makeEntity({ relationships: [] }),
      makeEntity({ relationships: [] }),
    ];
    const result = extractOntologyHints(entities);

    expect(result.edgeTypes).toEqual([]);
  });

  // ── Empty entities ────────────────────────────────────────────────

  it('should return empty arrays for empty entities input', () => {
    const result = extractOntologyHints([]);

    expect(result.entityTypes).toEqual([]);
    expect(result.edgeTypes).toEqual([]);
  });

  // ── Return shape ──────────────────────────────────────────────────

  it('should return OntologyHints with correct shape', () => {
    const entities = [
      makeEntity({
        class: 'state_actor',
        relationships: [{ target: 'X', type: 'OPPOSES' }],
      }),
    ];
    const result = extractOntologyHints(entities);

    expect(result).toHaveProperty('entityTypes');
    expect(result).toHaveProperty('edgeTypes');
    expect(Array.isArray(result.entityTypes)).toBe(true);
    expect(Array.isArray(result.edgeTypes)).toBe(true);
  });
});
