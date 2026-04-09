import { describe, it, expect } from 'vitest';

import { swarmVariant } from '../../src/config/variants/swarm.js';
import type { VariantConfig } from '../../src/types.js';

describe('swarm variant config', () => {
  it('exports a valid VariantConfig object', () => {
    const config: VariantConfig = swarmVariant;
    expect(config).toBeDefined();
    expect(config.id).toBe('swarm');
    expect(config.name).toBe('Swarm Intelligence');
  });

  it('defines all three swarm panels in order', () => {
    const { panels } = swarmVariant;
    expect(panels).toHaveLength(3);

    const ids = panels.map((p) => p.id);
    expect(ids).toEqual([
      'swarm-theater',
      'prediction-timeline',
      'faction-map',
    ]);
  });

  it('assigns ascending panel order', () => {
    const { panels } = swarmVariant;
    for (let i = 1; i < panels.length; i++) {
      expect(panels[i].order).toBeGreaterThan(panels[i - 1].order);
    }
  });

  it('expands the hero panel (swarm-theater) by default', () => {
    const hero = swarmVariant.panels.find((p) => p.id === 'swarm-theater');
    expect(hero).toBeDefined();
    expect(hero!.expanded).toBe(true);
  });

  it('collapses non-hero panels by default', () => {
    const nonHero = swarmVariant.panels.filter(
      (p) => p.id !== 'swarm-theater'
    );
    expect(nonHero.length).toBe(2);
    for (const panel of nonHero) {
      expect(panel.expanded).toBe(false);
    }
  });

  it('defines all three map layers', () => {
    const { layers } = swarmVariant;
    expect(layers).toHaveLength(3);

    const ids = layers.map((l) => l.id);
    expect(ids).toContain('swarm-predictions');
    expect(ids).toContain('faction-boundaries');
    expect(ids).toContain('consensus-heat');
  });

  it('assigns ascending layer render order', () => {
    const { layers } = swarmVariant;
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].order).toBeGreaterThan(layers[i - 1].order);
    }
  });

  it('makes swarm-predictions visible by default', () => {
    const pred = swarmVariant.layers.find((l) => l.id === 'swarm-predictions');
    expect(pred).toBeDefined();
    expect(pred!.visible).toBe(true);
  });

  it('makes consensus-heat hidden by default', () => {
    const heat = swarmVariant.layers.find((l) => l.id === 'consensus-heat');
    expect(heat).toBeDefined();
    expect(heat!.visible).toBe(false);
  });

  it('sets reasonable refresh intervals', () => {
    const { refreshIntervals } = swarmVariant;
    expect(refreshIntervals.simulations).toBe(10_000);
    expect(refreshIntervals.predictions).toBe(60_000);
    expect(refreshIntervals.factions).toBe(60_000);
  });

  it('sets api base url to empty string (relative)', () => {
    expect(swarmVariant.apiBaseUrl).toBe('');
  });
});
