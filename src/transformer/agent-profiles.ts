/**
 * Agent Profile Generator.
 *
 * Converts WorldMonitor entities into OASIS-compatible agent profiles
 * for MiroFish swarm simulation, then fills remaining slots with
 * generic "citizen" agents up to the target agent count.
 */

import { DEFAULT_AGENT_COUNT, MAX_ENTITY_COUNT } from '../config/constants.js';

import type { Entity } from '../worldmonitor/types.js';
import type { AgentProfile } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────

/** Entity-derived agents have high influence; they represent key actors. */
const ENTITY_INFLUENCE_WEIGHT = 0.8;

/** Citizen filler agents have low influence; they represent background population. */
const CITIZEN_INFLUENCE_WEIGHT = 0.05;

/**
 * Convert an entity name to a safe username (lowercase, underscored).
 * Removes special characters that are not alphanumeric, spaces, or hyphens.
 */
function toUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Build a persona string from entity data.
 * Includes objectives and constraints as context for the agent's behavior.
 */
function buildPersona(entity: Entity): string {
  const parts: string[] = [];

  parts.push(`${entity.name} is a ${entity.class} with a ${entity.stance} stance.`);

  if (entity.objectives.length > 0) {
    parts.push(`Objectives: ${entity.objectives.join(', ')}.`);
  }

  if (entity.constraints.length > 0) {
    parts.push(`Constraints: ${entity.constraints.join(', ')}.`);
  }

  if (entity.relationships.length > 0) {
    const relStrings = entity.relationships.map(
      (r) => `${r.type} ${r.target}`,
    );
    parts.push(`Relationships: ${relStrings.join('; ')}.`);
  }

  return parts.join(' ');
}

/**
 * Escape a CSV field value.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * Doubles any existing double quotes.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Generate agent profiles from WorldMonitor entities.
 *
 * - Creates one profile per entity (capped at MAX_ENTITY_COUNT)
 * - Fills remaining slots with generic "citizen" agents
 * - Returns profiles with sequential user IDs starting from 1
 *
 * @param entities - WorldMonitor entities (will be capped at MAX_ENTITY_COUNT)
 * @param targetCount - Total agent count (defaults to DEFAULT_AGENT_COUNT: 4096)
 */
export function generateAgentProfiles(
  entities: Entity[],
  targetCount: number = DEFAULT_AGENT_COUNT,
): AgentProfile[] {
  const profiles: AgentProfile[] = [];
  let nextId = 1;

  // Cap entities at MAX_ENTITY_COUNT
  const cappedEntities = entities.slice(0, MAX_ENTITY_COUNT);

  // Create entity-derived profiles
  for (const entity of cappedEntities) {
    profiles.push({
      userId: nextId,
      username: toUsername(entity.name),
      name: entity.name,
      persona: buildPersona(entity),
      entityClass: entity.class,
      stance: entity.stance,
      influenceWeight: ENTITY_INFLUENCE_WEIGHT,
    });
    nextId++;
  }

  // Fill remaining slots with citizen agents
  const fillerCount = Math.max(0, targetCount - profiles.length);

  for (let i = 0; i < fillerCount; i++) {
    profiles.push({
      userId: nextId,
      username: `citizen_${nextId}`,
      name: `Citizen ${nextId}`,
      persona: 'An informed observer following global events with moderate engagement.',
      entityClass: 'citizen',
      stance: 'neutral',
      influenceWeight: CITIZEN_INFLUENCE_WEIGHT,
    });
    nextId++;
  }

  return profiles;
}

/**
 * Convert agent profiles to CSV format.
 *
 * Returns a CSV string with header row followed by one row per profile.
 * Fields containing commas or quotes are properly escaped.
 */
export function profilesToCsv(profiles: AgentProfile[]): string {
  const header = 'user_id,username,name,persona,entity_class,stance,influence_weight';
  const rows = profiles.map((p) =>
    [
      String(p.userId),
      escapeCsvField(p.username),
      escapeCsvField(p.name),
      escapeCsvField(p.persona),
      escapeCsvField(p.entityClass),
      escapeCsvField(p.stance),
      String(p.influenceWeight),
    ].join(','),
  );

  return [header, ...rows].join('\n');
}
