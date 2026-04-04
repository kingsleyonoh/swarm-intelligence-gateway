import { describe, it, expect } from 'vitest';

import { generateSeedDocument } from '../../src/transformer/seed-document.js';
import type { SimPackage } from '../../src/worldmonitor/types.js';

/** A complete valid SimPackage fixture for transformer tests. */
function validSimPackage(): SimPackage {
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
      {
        label: 'Eastern Mediterranean',
        region: 'Europe',
        stateKind: 'political',
        rankingScore: 0.78,
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
      {
        name: 'US Navy',
        class: 'military',
        stance: 'defensive',
        objectives: ['Freedom of navigation', 'Deterrence'],
        constraints: ['Rules of engagement'],
        relationships: [
          { target: 'Iran Revolutionary Guard', type: 'OPPOSES' },
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
      'Analyze the cascading effects of a potential naval confrontation in the Strait of Hormuz.',
  };
}

describe('generateSeedDocument', () => {
  // ── Happy path ──────────────────────────────────────────────────────

  it('should return a SeedDocument with markdown string', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result).toBeDefined();
    expect(typeof result.markdown).toBe('string');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('should include the scenario title as heading', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('# Middle East Tensions Escalation Analysis');
  });

  it('should include simulation requirement', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('Analyze the cascading effects');
  });

  // ── Theater sections ──────────────────────────────────────────────

  it('should include theater sections with region and details', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('Persian Gulf Shipping Routes');
    expect(result.markdown).toContain('Middle East');
    expect(result.markdown).toContain('Strait of Hormuz');
    expect(result.markdown).toContain('Crude Oil');
    expect(result.markdown).toContain('conflict');
    expect(result.markdown).toContain('0.92');
  });

  it('should handle theaters without optional fields (route, commodity)', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    // The second theater has no route or commodity
    expect(result.markdown).toContain('Eastern Mediterranean');
    expect(result.markdown).toContain('Europe');
    expect(result.markdown).toContain('political');
  });

  // ── Entity (Key Actors) sections ──────────────────────────────────

  it('should include Key Actors section with entity details', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('Iran Revolutionary Guard');
    expect(result.markdown).toContain('state_actor');
    expect(result.markdown).toContain('aggressive');
    expect(result.markdown).toContain('Regional dominance');
    expect(result.markdown).toContain('Sanctions evasion');
  });

  it('should include entity constraints', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('International pressure');
    expect(result.markdown).toContain('Economic weakness');
  });

  it('should include entity relationships', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('US Navy');
    expect(result.markdown).toContain('OPPOSES');
    expect(result.markdown).toContain('Hezbollah');
    expect(result.markdown).toContain('ALLIED_WITH');
  });

  // ── Event Seeds ───────────────────────────────────────────────────

  it('should include event seed details', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('military_action');
    expect(result.markdown).toContain('Naval confrontation in Strait of Hormuz');
    expect(result.markdown).toContain('imminent');
    expect(result.markdown).toContain('0.85');
  });

  // ── Constraints ───────────────────────────────────────────────────

  it('should include hard and soft constraints', () => {
    const pkg = validSimPackage();
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('No direct US-Iran military conflict');
    expect(result.markdown).toContain('Oil price impact limited to 20%');
  });

  // ── Special characters sanitized ──────────────────────────────────

  it('should sanitize special markdown chars in entity names', () => {
    const pkg = validSimPackage();
    pkg.entities[0].name = 'Entity | with | pipes';
    const result = generateSeedDocument(pkg);

    // Pipes should be escaped in markdown to avoid table rendering issues
    expect(result.markdown).toContain('Entity');
    expect(result.markdown).not.toContain('| with | pipes');
  });

  it('should handle entities with HTML content already stripped by parser', () => {
    const pkg = validSimPackage();
    // Parser already strips HTML; just ensure no breakage with angle brackets
    pkg.entities[0].name = 'Entity with <angle> brackets';
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toContain('Entity with');
  });

  // ── Empty theaters ────────────────────────────────────────────────

  it('should handle empty theaters array gracefully', () => {
    const pkg = validSimPackage();
    pkg.selectedTheaters = [];
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toBeDefined();
    expect(result.markdown.length).toBeGreaterThan(0);
    // Should still have title and other sections
    expect(result.markdown).toContain('# Middle East Tensions Escalation Analysis');
  });

  it('should handle empty entities array gracefully', () => {
    const pkg = validSimPackage();
    pkg.entities = [];
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toBeDefined();
    expect(result.markdown).toContain('# Middle East Tensions Escalation Analysis');
  });

  it('should handle empty event seeds array gracefully', () => {
    const pkg = validSimPackage();
    pkg.eventSeeds = [];
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toBeDefined();
    expect(result.markdown).toContain('# Middle East Tensions Escalation Analysis');
  });

  it('should handle empty hard and soft constraints', () => {
    const pkg = validSimPackage();
    pkg.constraints = { hard: [], soft: [] };
    const result = generateSeedDocument(pkg);

    expect(result.markdown).toBeDefined();
    expect(result.markdown).toContain('# Middle East Tensions Escalation Analysis');
  });
});
