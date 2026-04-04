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
  const result = simPackageSchema.safeParse(raw);

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
