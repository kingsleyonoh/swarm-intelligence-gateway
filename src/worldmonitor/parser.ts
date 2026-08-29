import { z } from 'zod';

import { MAX_ENTITY_COUNT } from '../config/constants.js';
import { ValidationError } from '../shared/errors.js';

import type { SimPackage } from './types.js';

// ── Zod schemas ────────────────────────────────────────────────────────

const entityRelationshipSchema = z.object({
  target: z.string().min(1),
  type: z.string().min(1),
});

const theaterSchema = z.object({
  label: z.string().min(1),
  region: z.string().min(1),
  route: z.string().optional(),
  commodity: z.string().optional(),
  stateKind: z.string().min(1),
  rankingScore: z.number().min(0).max(1),
});

const entitySchema = z.object({
  name: z.string().min(1),
  class: z.string().min(1),
  stance: z.string().min(1),
  objectives: z.array(z.string()),
  constraints: z.array(z.string()),
  relationships: z.array(entityRelationshipSchema),
});

const eventSeedSchema = z.object({
  type: z.string().min(1),
  summary: z.string().min(1),
  timing: z.string().min(1),
  strength: z.number().min(0).max(1),
});

const constraintsSchema = z.object({
  hard: z.array(z.string()),
  soft: z.array(z.string()),
});

const simPackageSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.string().min(1),
  title: z.string().min(1),
  selectedTheaters: z.array(theaterSchema),
  entities: z.array(entitySchema),
  eventSeeds: z.array(eventSeedSchema),
  constraints: constraintsSchema,
  simulationRequirement: z.string().min(1),
});

// ── Helpers ────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function currentPackageShape(raw: UnknownRecord): boolean {
  const theaters = raw.selectedTheaters;
  const first = Array.isArray(theaters) ? theaters[0] : undefined;
  return isRecord(raw.simulationRequirement)
    || (isRecord(first) && ('candidateStateId' in first || 'dominantRegion' in first));
}

function normalizeCurrentTheater(theater: UnknownRecord): UnknownRecord {
  const label = stringValue(theater.label)
    ?? stringValue(theater.theaterLabel)
    ?? stringValue(theater.dominantRegion)
    ?? stringValue(theater.candidateStateId);
  const region = stringValue(theater.region)
    ?? stringValue(theater.dominantRegion)
    ?? (Array.isArray(theater.macroRegions) ? stringValue(theater.macroRegions[0]) : undefined);
  const score = typeof theater.rankingScore === 'number' && Number.isFinite(theater.rankingScore)
    ? Math.max(0, Math.min(1, theater.rankingScore))
    : 0.5;

  return {
    ...theater,
    label,
    region,
    route: stringValue(theater.route) ?? stringValue(theater.routeFacilityKey),
    commodity: stringValue(theater.commodity) ?? stringValue(theater.commodityKey),
    stateKind: stringValue(theater.stateKind) ?? 'unknown',
    rankingScore: score,
  };
}

function normalizeCurrentEntity(entity: UnknownRecord): UnknownRecord {
  const relationships = Array.isArray(entity.relationships)
    ? entity.relationships.filter(isRecord).map((relationship) => ({
      target: stringValue(relationship.target) ?? stringValue(relationship.targetName) ?? 'unknown',
      type: stringValue(relationship.type) ?? 'RELATED_TO',
    }))
    : [];

  return {
    ...entity,
    name: stringValue(entity.name) ?? stringValue(entity.entityId),
    class: stringValue(entity.class) ?? 'entity',
    stance: stringValue(entity.stance) ?? 'unknown',
    objectives: stringArray(entity.objectives),
    constraints: stringArray(entity.constraints),
    relationships,
  };
}

function normalizeCurrentSeed(seed: UnknownRecord): UnknownRecord {
  const evidenceRefs = stringArray(seed.evidenceRefs);
  return {
    ...seed,
    type: stringValue(seed.type) ?? 'observation',
    summary: stringValue(seed.summary) ?? evidenceRefs.join('; '),
    timing: stringValue(seed.timing) ?? 'unknown',
    strength: typeof seed.strength === 'number' && Number.isFinite(seed.strength)
      ? Math.max(0, Math.min(1, seed.strength))
      : 0.5,
  };
}

function constraintText(value: unknown): { text: string; hard: boolean } | undefined {
  if (typeof value === 'string' && value.trim()) return { text: value, hard: false };
  if (!isRecord(value)) return undefined;
  const text = stringValue(value.statement) ?? stringValue(value.description);
  return text ? { text, hard: value.hard === true } : undefined;
}

function normalizeCurrentConstraints(value: unknown): UnknownRecord {
  if (!isRecord(value) || Array.isArray(value.hard) || Array.isArray(value.soft)) return value as UnknownRecord;

  const hard: string[] = [];
  const soft: string[] = [];
  for (const entries of Object.values(value)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const parsed = constraintText(entry);
      if (!parsed) continue;
      (parsed.hard ? hard : soft).push(parsed.text);
    }
  }
  return { hard, soft };
}

/** Convert WorldMonitor's current v2 package into the gateway's stable shape. */
function normalizeCurrentPackage(raw: unknown): unknown {
  if (!isRecord(raw) || !currentPackageShape(raw)) return raw;

  const theaters = Array.isArray(raw.selectedTheaters)
    ? raw.selectedTheaters.filter(isRecord).map(normalizeCurrentTheater)
    : raw.selectedTheaters;
  const entities = Array.isArray(raw.entities)
    ? raw.entities.filter(isRecord).map(normalizeCurrentEntity)
    : raw.entities;
  const eventSeeds = Array.isArray(raw.eventSeeds)
    ? raw.eventSeeds.filter(isRecord).map(normalizeCurrentSeed)
    : raw.eventSeeds;
  const requirements = isRecord(raw.simulationRequirement)
    ? Object.values(raw.simulationRequirement).filter((value): value is string => typeof value === 'string')
    : raw.simulationRequirement;
  const firstTheater = Array.isArray(theaters) && isRecord(theaters[0]) ? theaters[0].label : undefined;
  const generatedAt = typeof raw.generatedAt === 'number' ? raw.generatedAt : undefined;

  return {
    ...raw,
    timestamp: stringValue(raw.timestamp)
      ?? (generatedAt !== undefined ? new Date(generatedAt).toISOString() : undefined),
    title: stringValue(raw.title)
      ?? (typeof firstTheater === 'string' ? `WorldMonitor simulation: ${firstTheater}` : undefined),
    selectedTheaters: theaters,
    entities,
    eventSeeds,
    constraints: normalizeCurrentConstraints(raw.constraints),
    simulationRequirement: Array.isArray(requirements) ? requirements.join('\n\n') : requirements,
  };
}

/** Strip HTML tags from a string to prevent XSS in downstream output. */
function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/** Recursively sanitize all string values in a parsed SimPackage. */
function sanitizePackage(pkg: SimPackage): SimPackage {
  return {
    runId: stripHtmlTags(pkg.runId),
    timestamp: pkg.timestamp,
    title: stripHtmlTags(pkg.title),
    selectedTheaters: pkg.selectedTheaters.map((t) => ({
      ...t,
      label: stripHtmlTags(t.label),
      region: stripHtmlTags(t.region),
      route: t.route ? stripHtmlTags(t.route) : undefined,
      commodity: t.commodity ? stripHtmlTags(t.commodity) : undefined,
      stateKind: stripHtmlTags(t.stateKind),
    })),
    entities: pkg.entities.map((e) => ({
      name: stripHtmlTags(e.name),
      class: stripHtmlTags(e.class),
      stance: stripHtmlTags(e.stance),
      objectives: e.objectives.map(stripHtmlTags),
      constraints: e.constraints.map(stripHtmlTags),
      relationships: e.relationships.map((r) => ({
        target: stripHtmlTags(r.target),
        type: stripHtmlTags(r.type),
      })),
    })),
    eventSeeds: pkg.eventSeeds.map((s) => ({
      type: stripHtmlTags(s.type),
      summary: stripHtmlTags(s.summary),
      timing: stripHtmlTags(s.timing),
      strength: s.strength,
    })),
    constraints: {
      hard: pkg.constraints.hard.map(stripHtmlTags),
      soft: pkg.constraints.soft.map(stripHtmlTags),
    },
    simulationRequirement: stripHtmlTags(pkg.simulationRequirement),
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Parse and validate a raw WorldMonitor SimPackage.
 *
 * - Validates shape against Zod schema
 * - Caps entities at MAX_ENTITY_COUNT (20), taking the first N
 * - Sanitizes HTML tags from all text fields
 * - Strips unknown fields (forward-compatible)
 *
 * @throws {ValidationError} if the input does not match the expected shape
 */
export function parseSimPackage(raw: unknown): SimPackage {
  const result = simPackageSchema.safeParse(normalizeCurrentPackage(raw));

  if (!result.success) {
    throw new ValidationError(
      'Invalid SimPackage: ' + result.error.issues[0]?.message,
      result.error.issues,
    );
  }

  let parsed = result.data as SimPackage;

  // Cap entities at MAX_ENTITY_COUNT, taking the first N from input
  if (parsed.entities.length > MAX_ENTITY_COUNT) {
    parsed = {
      ...parsed,
      entities: parsed.entities.slice(0, MAX_ENTITY_COUNT),
    };
  }

  return sanitizePackage(parsed);
}
