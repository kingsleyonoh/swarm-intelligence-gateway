/**
 * Seed Document Generator.
 *
 * Converts a WorldMonitor SimPackage into a structured Markdown document
 * that serves as the seed input for MiroFish swarm simulations.
 */

import type { SimPackage } from '../worldmonitor/types.js';
import type { SeedDocument } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Escape pipe characters in text to prevent Markdown table rendering issues.
 * Also escapes angle brackets that might slip through.
 */
function sanitizeMarkdown(text: string): string {
  return text
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Section Builders ──────────────────────────────────────────────────

function buildTheaterSection(pkg: SimPackage): string {
  if (pkg.selectedTheaters.length === 0) {
    return '';
  }

  const lines: string[] = ['## Theaters\n'];

  for (const theater of pkg.selectedTheaters) {
    lines.push(`### ${sanitizeMarkdown(theater.label)}\n`);
    lines.push(`- **Region:** ${sanitizeMarkdown(theater.region)}`);

    if (theater.route) {
      lines.push(`- **Route:** ${sanitizeMarkdown(theater.route)}`);
    }
    if (theater.commodity) {
      lines.push(`- **Commodity:** ${sanitizeMarkdown(theater.commodity)}`);
    }

    lines.push(`- **State Kind:** ${sanitizeMarkdown(theater.stateKind)}`);
    lines.push(`- **Ranking Score:** ${theater.rankingScore}`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildEntitySection(pkg: SimPackage): string {
  if (pkg.entities.length === 0) {
    return '';
  }

  const lines: string[] = ['## Key Actors\n'];

  for (const entity of pkg.entities) {
    lines.push(`### ${sanitizeMarkdown(entity.name)}\n`);
    lines.push(`- **Class:** ${sanitizeMarkdown(entity.class)}`);
    lines.push(`- **Stance:** ${sanitizeMarkdown(entity.stance)}`);

    if (entity.objectives.length > 0) {
      lines.push('- **Objectives:**');
      for (const obj of entity.objectives) {
        lines.push(`  - ${sanitizeMarkdown(obj)}`);
      }
    }

    if (entity.constraints.length > 0) {
      lines.push('- **Constraints:**');
      for (const constraint of entity.constraints) {
        lines.push(`  - ${sanitizeMarkdown(constraint)}`);
      }
    }

    if (entity.relationships.length > 0) {
      lines.push('- **Relationships:**');
      for (const rel of entity.relationships) {
        lines.push(`  - ${sanitizeMarkdown(rel.type)} → ${sanitizeMarkdown(rel.target)}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function buildEventSeedSection(pkg: SimPackage): string {
  if (pkg.eventSeeds.length === 0) {
    return '';
  }

  const lines: string[] = ['## Event Seeds\n'];

  for (const seed of pkg.eventSeeds) {
    lines.push(`### ${sanitizeMarkdown(seed.type)}\n`);
    lines.push(`- **Summary:** ${sanitizeMarkdown(seed.summary)}`);
    lines.push(`- **Timing:** ${sanitizeMarkdown(seed.timing)}`);
    lines.push(`- **Strength:** ${seed.strength}`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildConstraintsSection(pkg: SimPackage): string {
  const hasHard = pkg.constraints.hard.length > 0;
  const hasSoft = pkg.constraints.soft.length > 0;

  if (!hasHard && !hasSoft) {
    return '';
  }

  const lines: string[] = ['## Constraints\n'];

  if (hasHard) {
    lines.push('### Hard Constraints\n');
    for (const c of pkg.constraints.hard) {
      lines.push(`- ${sanitizeMarkdown(c)}`);
    }
    lines.push('');
  }

  if (hasSoft) {
    lines.push('### Soft Constraints\n');
    for (const c of pkg.constraints.soft) {
      lines.push(`- ${sanitizeMarkdown(c)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Generate a Markdown seed document from a WorldMonitor SimPackage.
 *
 * The document follows a structured format that MiroFish uses to build
 * its knowledge graph and seed the swarm simulation:
 * 1. Title + simulation requirement
 * 2. Theaters (regions, routes, commodities)
 * 3. Key Actors (entities with objectives, constraints, relationships)
 * 4. Event Seeds (triggers with timing and strength)
 * 5. Constraints (hard and soft boundaries)
 */
export function generateSeedDocument(pkg: SimPackage): SeedDocument {
  const sections: string[] = [];

  // Title
  sections.push(`# ${sanitizeMarkdown(pkg.title)}\n`);

  // Simulation requirement
  sections.push(`## Simulation Requirement\n`);
  sections.push(`${sanitizeMarkdown(pkg.simulationRequirement)}\n`);

  // Optional sections — only included if data exists
  const theaterSection = buildTheaterSection(pkg);
  if (theaterSection) sections.push(theaterSection);

  const entitySection = buildEntitySection(pkg);
  if (entitySection) sections.push(entitySection);

  const eventSeedSection = buildEventSeedSection(pkg);
  if (eventSeedSection) sections.push(eventSeedSection);

  const constraintsSection = buildConstraintsSection(pkg);
  if (constraintsSection) sections.push(constraintsSection);

  return {
    markdown: sections.join('\n'),
  };
}
