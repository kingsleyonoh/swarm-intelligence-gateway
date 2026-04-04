import { describe, it, expect } from 'vitest';

import { parseSimPackage } from '../../src/worldmonitor/parser.js';
import type { SimPackage } from '../../src/worldmonitor/types.js';

/** A minimal valid SimPackage fixture. */
function validPackage(): Record<string, unknown> {
  return {
    runId: 'wm-2026-04-04-001',
    timestamp: '2026-04-04T12:00:00Z',
    title: 'Middle East Tensions Escalation Analysis',
    selectedTheaters: [
      {
        label: 'Persian Gulf Shipping Routes',
        region: 'Middle East',
        route: 'Strait of Hormuz',
        commodity: 'Crude Oil',
        stateKind: 'conflict',
        rankingScore: 0.92,
      },
    ],
    entities: [
      {
        name: 'Iran Revolutionary Guard',
        class: 'state_actor',
        stance: 'aggressive',
        objectives: ['Regional dominance', 'Sanctions evasion'],
        constraints: ['International pressure', 'Economic weakness'],
        relationships: [
          { target: 'US Navy', type: 'OPPOSES' },
          { target: 'Hezbollah', type: 'ALLIED_WITH' },
        ],
      },
    ],
    eventSeeds: [
      {
        type: 'military_action',
        summary: 'Naval confrontation in Strait of Hormuz',
        timing: 'imminent',
        strength: 0.85,
      },
    ],
    constraints: {
      hard: ['No direct US-Iran military conflict'],
      soft: ['Oil price impact limited to 20%'],
    },
    simulationRequirement:
      'Analyze the cascading effects of a potential naval confrontation...',
  };
}

describe('parseSimPackage', () => {
  // ── Happy path ──────────────────────────────────────────────────────

  it('should parse a valid SimPackage correctly', () => {
    const raw = validPackage();
    const result = parseSimPackage(raw);

    expect(result.runId).toBe('wm-2026-04-04-001');
    expect(result.timestamp).toBe('2026-04-04T12:00:00Z');
    expect(result.title).toBe('Middle East Tensions Escalation Analysis');
    expect(result.selectedTheaters).toHaveLength(1);
    expect(result.entities).toHaveLength(1);
    expect(result.eventSeeds).toHaveLength(1);
    expect(result.constraints.hard).toHaveLength(1);
    expect(result.constraints.soft).toHaveLength(1);
    expect(result.simulationRequirement).toContain('cascading effects');
  });

  it('should parse all theater fields', () => {
    const result = parseSimPackage(validPackage());

    const theater = result.selectedTheaters[0];
    expect(theater.label).toBe('Persian Gulf Shipping Routes');
    expect(theater.region).toBe('Middle East');
    expect(theater.route).toBe('Strait of Hormuz');
    expect(theater.commodity).toBe('Crude Oil');
    expect(theater.stateKind).toBe('conflict');
    expect(theater.rankingScore).toBe(0.92);
  });

  it('should parse all entity fields including relationships', () => {
    const result = parseSimPackage(validPackage());

    const entity = result.entities[0];
    expect(entity.name).toBe('Iran Revolutionary Guard');
    expect(entity.class).toBe('state_actor');
    expect(entity.stance).toBe('aggressive');
    expect(entity.objectives).toEqual(['Regional dominance', 'Sanctions evasion']);
    expect(entity.constraints).toEqual(['International pressure', 'Economic weakness']);
    expect(entity.relationships).toHaveLength(2);
    expect(entity.relationships[0]).toEqual({ target: 'US Navy', type: 'OPPOSES' });
  });

  it('should parse event seeds', () => {
    const result = parseSimPackage(validPackage());

    const seed = result.eventSeeds[0];
    expect(seed.type).toBe('military_action');
    expect(seed.summary).toBe('Naval confrontation in Strait of Hormuz');
    expect(seed.timing).toBe('imminent');
    expect(seed.strength).toBe(0.85);
  });

  // ── Missing required fields ─────────────────────────────────────────

  it('should throw when runId is missing', () => {
    const raw = validPackage();
    delete raw.runId;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when title is missing', () => {
    const raw = validPackage();
    delete raw.title;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when selectedTheaters is missing', () => {
    const raw = validPackage();
    delete raw.selectedTheaters;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when entities is missing', () => {
    const raw = validPackage();
    delete raw.entities;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when eventSeeds is missing', () => {
    const raw = validPackage();
    delete raw.eventSeeds;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when constraints is missing', () => {
    const raw = validPackage();
    delete raw.constraints;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when simulationRequirement is missing', () => {
    const raw = validPackage();
    delete raw.simulationRequirement;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  // ── Type validation ─────────────────────────────────────────────────

  it('should throw when runId is not a string', () => {
    const raw = validPackage();
    raw.runId = 42;
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when selectedTheaters is not an array', () => {
    const raw = validPackage();
    raw.selectedTheaters = 'not-an-array';
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when entity is missing required fields', () => {
    const raw = validPackage();
    raw.entities = [{ name: 'Incomplete Entity' }]; // missing class, stance, etc.
    expect(() => parseSimPackage(raw)).toThrow();
  });

  it('should throw when strength is not a number', () => {
    const raw = validPackage();
    raw.eventSeeds = [
      {
        type: 'military_action',
        summary: 'Some event',
        timing: 'imminent',
        strength: 'high', // should be a number
      },
    ];
    expect(() => parseSimPackage(raw)).toThrow();
  });

  // ── Empty arrays (allowed) ──────────────────────────────────────────

  it('should allow empty entities array', () => {
    const raw = validPackage();
    raw.entities = [];
    const result = parseSimPackage(raw);
    expect(result.entities).toEqual([]);
  });

  it('should allow empty eventSeeds array', () => {
    const raw = validPackage();
    raw.eventSeeds = [];
    const result = parseSimPackage(raw);
    expect(result.eventSeeds).toEqual([]);
  });

  it('should allow empty selectedTheaters array', () => {
    const raw = validPackage();
    raw.selectedTheaters = [];
    const result = parseSimPackage(raw);
    expect(result.selectedTheaters).toEqual([]);
  });

  // ── Entity count capping ────────────────────────────────────────────

  it('should cap entities at 20 when more than 20 are provided', () => {
    const raw = validPackage();
    const entities = [];
    for (let i = 0; i < 25; i++) {
      entities.push({
        name: `Entity ${i}`,
        class: 'state_actor',
        stance: 'neutral',
        objectives: [],
        constraints: [],
        relationships: [],
      });
    }
    raw.entities = entities;

    const result = parseSimPackage(raw);
    expect(result.entities).toHaveLength(20);
  });

  it('should keep entities sorted by name when capping (deterministic)', () => {
    const raw = validPackage();
    const entities = [];
    for (let i = 0; i < 25; i++) {
      entities.push({
        name: `Entity ${String(i).padStart(2, '0')}`,
        class: 'state_actor',
        stance: 'neutral',
        objectives: [],
        constraints: [],
        relationships: [],
      });
    }
    raw.entities = entities;

    const result = parseSimPackage(raw);
    expect(result.entities).toHaveLength(20);
    // Should take the first 20 from the input
    expect(result.entities[0].name).toBe('Entity 00');
    expect(result.entities[19].name).toBe('Entity 19');
  });

  // ── Extra fields (forward-compatible) ───────────────────────────────

  it('should ignore extra top-level fields', () => {
    const raw = validPackage();
    (raw as any).extraField = 'should be ignored';
    (raw as any).version = 2;

    const result = parseSimPackage(raw);
    expect(result.runId).toBe('wm-2026-04-04-001');
    // The result should not contain extra fields
    expect((result as any).extraField).toBeUndefined();
    expect((result as any).version).toBeUndefined();
  });

  it('should ignore extra fields on entities', () => {
    const raw = validPackage();
    (raw.entities as any[])[0].extraField = 'ignored';

    const result = parseSimPackage(raw);
    expect(result.entities[0].name).toBe('Iran Revolutionary Guard');
    expect((result.entities[0] as any).extraField).toBeUndefined();
  });

  // ── Special characters sanitization ─────────────────────────────────

  it('should sanitize HTML tags from text fields', () => {
    const raw = validPackage();
    raw.title = '<script>alert("xss")</script>Middle East Analysis';

    const result = parseSimPackage(raw);
    expect(result.title).not.toContain('<script>');
    expect(result.title).toContain('Middle East Analysis');
  });

  it('should sanitize HTML tags from entity names', () => {
    const raw = validPackage();
    (raw.entities as any[])[0].name = 'Iran <b>Revolutionary</b> Guard';

    const result = parseSimPackage(raw);
    expect(result.entities[0].name).not.toContain('<b>');
    expect(result.entities[0].name).toContain('Iran');
    expect(result.entities[0].name).toContain('Revolutionary');
    expect(result.entities[0].name).toContain('Guard');
  });

  // ── Optional fields with defaults ───────────────────────────────────

  it('should allow theater without optional fields (route, commodity)', () => {
    const raw = validPackage();
    raw.selectedTheaters = [
      {
        label: 'Test Theater',
        region: 'Europe',
        stateKind: 'political',
        rankingScore: 0.5,
      },
    ];

    const result = parseSimPackage(raw);
    expect(result.selectedTheaters[0].label).toBe('Test Theater');
    expect(result.selectedTheaters[0].route).toBeUndefined();
    expect(result.selectedTheaters[0].commodity).toBeUndefined();
  });

  // ── Null / undefined input ──────────────────────────────────────────

  it('should throw when input is null', () => {
    expect(() => parseSimPackage(null)).toThrow();
  });

  it('should throw when input is undefined', () => {
    expect(() => parseSimPackage(undefined)).toThrow();
  });

  it('should throw when input is a string', () => {
    expect(() => parseSimPackage('not an object')).toThrow();
  });

  it('should throw when input is a number', () => {
    expect(() => parseSimPackage(42)).toThrow();
  });

  // ── Timestamp field ─────────────────────────────────────────────────

  it('should accept a valid ISO timestamp', () => {
    const raw = validPackage();
    raw.timestamp = '2026-04-04T12:00:00Z';
    const result = parseSimPackage(raw);
    expect(result.timestamp).toBe('2026-04-04T12:00:00Z');
  });

  it('should throw when timestamp is missing', () => {
    const raw = validPackage();
    delete raw.timestamp;
    expect(() => parseSimPackage(raw)).toThrow();
  });
});
