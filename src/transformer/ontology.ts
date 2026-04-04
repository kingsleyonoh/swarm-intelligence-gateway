/**
 * Ontology Hints Extractor.
 *
 * Extracts entity types and relationship (edge) types from WorldMonitor
 * entities to provide hints for MiroFish knowledge graph construction.
 */

import type { Entity } from '../worldmonitor/types.js';
import type { OntologyHints } from './types.js';

/**
 * Convert a snake_case string to PascalCase.
 *
 * Examples:
 * - `state_actor` → `StateActor`
 * - `military` → `Military`
 * - `non_state_armed_group` → `NonStateArmedGroup`
 */
export function toPascalCase(input: string): string {
  return input
    .split('_')
    .map((segment) =>
      segment.length > 0
        ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
        : '',
    )
    .join('');
}

/**
 * Extract ontology hints from WorldMonitor entities.
 *
 * - Entity classes are deduplicated and converted to PascalCase
 * - Edge types are extracted from all entity relationships, deduplicated
 * - Both lists are sorted alphabetically for deterministic output
 */
export function extractOntologyHints(entities: Entity[]): OntologyHints {
  const entityTypeSet = new Set<string>();
  const edgeTypeSet = new Set<string>();

  for (const entity of entities) {
    entityTypeSet.add(toPascalCase(entity.class));

    for (const rel of entity.relationships) {
      edgeTypeSet.add(rel.type);
    }
  }

  return {
    entityTypes: [...entityTypeSet].sort(),
    edgeTypes: [...edgeTypeSet].sort(),
  };
}
