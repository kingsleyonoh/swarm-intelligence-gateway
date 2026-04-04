/**
 * WorldMonitor SimPackage types.
 *
 * These types represent the structured simulation package format
 * published by WorldMonitor to Redis at key `forecast:simulation-package:latest`.
 */

/** A geographic / domain theater selected for simulation. */
export interface Theater {
  label: string;
  region: string;
  route?: string;
  commodity?: string;
  stateKind: string;
  rankingScore: number;
}

/** A directional relationship between two entities. */
export interface EntityRelationship {
  target: string;
  type: string;
}

/** An actor or faction involved in the simulation scenario. */
export interface Entity {
  name: string;
  class: string;
  stance: string;
  objectives: string[];
  constraints: string[];
  relationships: EntityRelationship[];
}

/** A seed event that drives the simulation. */
export interface EventSeed {
  type: string;
  summary: string;
  timing: string;
  strength: number;
}

/** Hard and soft constraints for simulation boundaries. */
export interface Constraints {
  hard: string[];
  soft: string[];
}

/**
 * Full WorldMonitor simulation package.
 *
 * This is the top-level structure read from Redis and parsed by
 * `parseSimPackage()` in `parser.ts`.
 */
export interface SimPackage {
  runId: string;
  timestamp: string;
  title: string;
  selectedTheaters: Theater[];
  entities: Entity[];
  eventSeeds: EventSeed[];
  constraints: Constraints;
  simulationRequirement: string;
}
