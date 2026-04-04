import { describe, it, expect } from 'vitest';

import { generateAgentProfiles, profilesToCsv } from '../../src/transformer/agent-profiles.js';
import type { Entity } from '../../src/worldmonitor/types.js';

/** Helper to create test entities. */
function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    name: 'Test Entity',
    class: 'state_actor',
    stance: 'neutral',
    objectives: ['Stability'],
    constraints: ['Limited resources'],
    relationships: [],
    ...overrides,
  };
}

describe('generateAgentProfiles', () => {
  // ── Entity → profile mapping ──────────────────────────────────────

  it('should create a profile for each entity', () => {
    const entities = [
      makeEntity({ name: 'Iran Revolutionary Guard', class: 'state_actor', stance: 'aggressive' }),
      makeEntity({ name: 'US Navy', class: 'military', stance: 'defensive' }),
    ];
    const profiles = generateAgentProfiles(entities, 10);

    // First profiles should be entity-derived
    const entityProfiles = profiles.filter((p) => p.entityClass !== 'citizen');
    expect(entityProfiles).toHaveLength(2);
    expect(entityProfiles[0].name).toBe('Iran Revolutionary Guard');
    expect(entityProfiles[0].entityClass).toBe('state_actor');
    expect(entityProfiles[0].stance).toBe('aggressive');
    expect(entityProfiles[1].name).toBe('US Navy');
    expect(entityProfiles[1].entityClass).toBe('military');
  });

  it('should assign sequential user IDs starting from 1', () => {
    const entities = [
      makeEntity({ name: 'Entity A' }),
      makeEntity({ name: 'Entity B' }),
    ];
    const profiles = generateAgentProfiles(entities, 5);

    expect(profiles[0].userId).toBe(1);
    expect(profiles[1].userId).toBe(2);
    expect(profiles[2].userId).toBe(3); // first filler
  });

  it('should generate username from entity name (lowercase, underscored)', () => {
    const entities = [
      makeEntity({ name: 'Iran Revolutionary Guard' }),
    ];
    const profiles = generateAgentProfiles(entities, 5);

    expect(profiles[0].username).toBe('iran_revolutionary_guard');
  });

  it('should include entity objectives in persona', () => {
    const entities = [
      makeEntity({
        name: 'Iran Guard',
        objectives: ['Regional dominance', 'Sanctions evasion'],
      }),
    ];
    const profiles = generateAgentProfiles(entities, 5);

    expect(profiles[0].persona).toContain('Regional dominance');
    expect(profiles[0].persona).toContain('Sanctions evasion');
  });

  it('should set higher influence weight for entity-derived agents', () => {
    const entities = [makeEntity({ name: 'Major Power' })];
    const profiles = generateAgentProfiles(entities, 10);

    const entityProfile = profiles[0];
    const fillerProfile = profiles[1];

    expect(entityProfile.influenceWeight).toBeGreaterThan(fillerProfile.influenceWeight);
  });

  // ── Filler generation to target count ─────────────────────────────

  it('should fill to target agent count with citizen agents', () => {
    const entities = [makeEntity({ name: 'Solo Entity' })];
    const profiles = generateAgentProfiles(entities, 100);

    expect(profiles).toHaveLength(100);
    // First profile is entity-derived
    expect(profiles[0].entityClass).toBe('state_actor');
    // Remaining should be citizens
    const citizens = profiles.filter((p) => p.entityClass === 'citizen');
    expect(citizens).toHaveLength(99);
  });

  it('should fill to DEFAULT_AGENT_COUNT (4096) when not specified', () => {
    const entities = [makeEntity({ name: 'Solo Entity' })];
    const profiles = generateAgentProfiles(entities);

    expect(profiles).toHaveLength(4096);
  });

  it('should assign citizen agents neutral stance', () => {
    const entities = [makeEntity({ name: 'Entity' })];
    const profiles = generateAgentProfiles(entities, 10);

    const citizens = profiles.filter((p) => p.entityClass === 'citizen');
    for (const c of citizens) {
      expect(c.stance).toBe('neutral');
    }
  });

  it('should assign citizen agents lower influence weight', () => {
    const entities = [makeEntity({ name: 'Entity' })];
    const profiles = generateAgentProfiles(entities, 10);

    const citizens = profiles.filter((p) => p.entityClass === 'citizen');
    for (const c of citizens) {
      expect(c.influenceWeight).toBeLessThanOrEqual(0.1);
    }
  });

  // ── Entity count > 20 capped ──────────────────────────────────────

  it('should cap entity profiles at MAX_ENTITY_COUNT (20)', () => {
    const entities: Entity[] = [];
    for (let i = 0; i < 25; i++) {
      entities.push(
        makeEntity({ name: `Entity ${i}`, class: `class_${i}` }),
      );
    }
    const profiles = generateAgentProfiles(entities, 100);

    const entityProfiles = profiles.filter((p) => p.entityClass !== 'citizen');
    expect(entityProfiles.length).toBeLessThanOrEqual(20);
    expect(profiles).toHaveLength(100);
  });

  // ── Empty entities ────────────────────────────────────────────────

  it('should generate only filler agents when entities is empty', () => {
    const profiles = generateAgentProfiles([], 50);

    expect(profiles).toHaveLength(50);
    for (const p of profiles) {
      expect(p.entityClass).toBe('citizen');
    }
  });

  // ── Special characters in names ───────────────────────────────────

  it('should sanitize special characters in usernames', () => {
    const entities = [
      makeEntity({ name: 'Entity "Leader" (Top)' }),
    ];
    const profiles = generateAgentProfiles(entities, 5);

    // Username should not contain special chars
    expect(profiles[0].username).not.toContain('"');
    expect(profiles[0].username).not.toContain('(');
    expect(profiles[0].username).not.toContain(')');
  });
});

describe('profilesToCsv', () => {
  it('should produce valid CSV with header row', () => {
    const entities = [makeEntity({ name: 'Test Entity' })];
    const profiles = generateAgentProfiles(entities, 3);
    const csv = profilesToCsv(profiles);

    const lines = csv.trim().split('\n');
    // First line is header
    expect(lines[0]).toContain('user_id');
    expect(lines[0]).toContain('username');
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('persona');
    expect(lines[0]).toContain('entity_class');
    expect(lines[0]).toContain('stance');
    expect(lines[0]).toContain('influence_weight');
  });

  it('should have one data row per profile plus header', () => {
    const entities = [makeEntity({ name: 'Test Entity' })];
    const profiles = generateAgentProfiles(entities, 5);
    const csv = profilesToCsv(profiles);

    const lines = csv.trim().split('\n');
    // 1 header + 5 data rows
    expect(lines).toHaveLength(6);
  });

  it('should escape commas in persona fields', () => {
    const entities = [
      makeEntity({
        name: 'Multi Objective Entity',
        objectives: ['Goal one, part A', 'Goal two'],
      }),
    ];
    const profiles = generateAgentProfiles(entities, 2);
    const csv = profilesToCsv(profiles);

    // The persona field contains commas; CSV should quote it
    const lines = csv.trim().split('\n');
    const entityLine = lines[1];
    // Ensure the line has quoted fields when commas appear
    expect(entityLine).toContain('"');
  });

  it('should produce CSV for empty profiles array', () => {
    const csv = profilesToCsv([]);

    const lines = csv.trim().split('\n');
    // Should still have a header
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('user_id');
  });
});
