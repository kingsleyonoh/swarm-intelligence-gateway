import { describe, it, expect, beforeEach } from 'vitest';

import { FactionBoundariesLayer } from '../../src/layers/FactionBoundariesLayer.js';
import type {
  FactionFeature,
  FactionFeatureCollection,
  GeoJsonLayerConfig,
} from '../../src/layers/faction-layer-types.js';
import {
  FACTION_STANCE_COLORS,
  DEFAULT_FACTION_COLOR,
} from '../../src/layers/faction-layer-types.js';
import type { MapLayer } from '../../src/types.js';

function makeFeature(
  overrides: Partial<FactionFeature['properties']> = {},
): FactionFeature {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [44.0, 33.0],
          [44.5, 33.0],
          [44.5, 33.5],
          [44.0, 33.5],
          [44.0, 33.0],
        ],
      ],
    },
    properties: {
      region: 'Middle East',
      stance: 'escalate',
      factionName: 'Hawks',
      confidence: 0.8,
      ...overrides,
    },
  };
}

function makeCollection(
  features: FactionFeature[],
): FactionFeatureCollection {
  return {
    type: 'FeatureCollection',
    features,
  };
}

describe('FactionBoundariesLayer', () => {
  let layer: FactionBoundariesLayer;

  beforeEach(() => {
    layer = new FactionBoundariesLayer();
  });

  it('has correct id "faction-boundaries"', () => {
    expect(layer.id).toBe('faction-boundaries');
  });

  it('has correct type "geojson"', () => {
    expect(layer.type).toBe('geojson');
  });

  it('implements MapLayer interface', () => {
    const mapLayer: MapLayer = layer;
    expect(mapLayer.id).toBe('faction-boundaries');
    expect(typeof mapLayer.create).toBe('function');
    expect(typeof mapLayer.update).toBe('function');
    expect(typeof mapLayer.destroy).toBe('function');
  });

  describe('create()', () => {
    it('processes GeoJSON FeatureCollection into layer config', () => {
      const collection = makeCollection([makeFeature()]);
      const config = layer.create(collection) as GeoJsonLayerConfig;

      expect(config.type).toBe('geojson');
      expect(config.features).toHaveLength(1);
      expect(config.featureCollection).toBe(collection);
    });

    it('maps escalate stance to red fill color', () => {
      const collection = makeCollection([
        makeFeature({ stance: 'escalate' }),
      ]);
      const config = layer.create(collection) as GeoJsonLayerConfig;
      const [r, g, b] = config.features[0].fillColor;

      // #e05252 -> [224, 82, 82]
      expect(r).toBe(224);
      expect(g).toBe(82);
      expect(b).toBe(82);
    });

    it('maps de_escalate stance to blue fill color', () => {
      const collection = makeCollection([
        makeFeature({ stance: 'de_escalate' }),
      ]);
      const config = layer.create(collection) as GeoJsonLayerConfig;
      const [r, g, b] = config.features[0].fillColor;

      // #4a90d9 -> [74, 144, 217]
      expect(r).toBe(74);
      expect(g).toBe(144);
      expect(b).toBe(217);
    });

    it('maps uncertain stance to yellow fill color', () => {
      const collection = makeCollection([
        makeFeature({ stance: 'uncertain' }),
      ]);
      const config = layer.create(collection) as GeoJsonLayerConfig;
      const [r, g, b] = config.features[0].fillColor;

      // #d4a843 -> [212, 168, 67]
      expect(r).toBe(212);
      expect(g).toBe(168);
      expect(b).toBe(67);
    });

    it('maps neutral stance to gray fill color', () => {
      const collection = makeCollection([
        makeFeature({ stance: 'neutral' }),
      ]);
      const config = layer.create(collection) as GeoJsonLayerConfig;
      const [r, g, b] = config.features[0].fillColor;

      // #888888 -> [136, 136, 136]
      expect(r).toBe(136);
      expect(g).toBe(136);
      expect(b).toBe(136);
    });

    it('uses default gray for unknown stance', () => {
      const collection = makeCollection([
        makeFeature({ stance: 'unknown_stance' }),
      ]);
      const config = layer.create(collection) as GeoJsonLayerConfig;
      const [r, g, b] = config.features[0].fillColor;

      expect(r).toBe(136);
      expect(g).toBe(136);
      expect(b).toBe(136);
    });

    it('sets fill alpha to 120 for semi-transparent overlays', () => {
      const collection = makeCollection([makeFeature()]);
      const config = layer.create(collection) as GeoJsonLayerConfig;

      expect(config.features[0].fillColor[3]).toBe(120);
    });

    it('sets line color with full opacity (255)', () => {
      const collection = makeCollection([makeFeature()]);
      const config = layer.create(collection) as GeoJsonLayerConfig;

      expect(config.features[0].lineColor[3]).toBe(255);
    });

    it('preserves original feature reference', () => {
      const feature = makeFeature();
      const collection = makeCollection([feature]);
      const config = layer.create(collection) as GeoJsonLayerConfig;

      expect(config.features[0].feature).toBe(feature);
    });

    it('processes multiple features', () => {
      const collection = makeCollection([
        makeFeature({ stance: 'escalate', region: 'Region A' }),
        makeFeature({ stance: 'de_escalate', region: 'Region B' }),
        makeFeature({ stance: 'neutral', region: 'Region C' }),
      ]);
      const config = layer.create(collection) as GeoJsonLayerConfig;

      expect(config.features).toHaveLength(3);
    });
  });

  describe('update()', () => {
    it('updates stored config with new data', () => {
      layer.create(
        makeCollection([makeFeature({ region: 'Old Region' })]),
      );

      layer.update(
        makeCollection([makeFeature({ region: 'New Region' })]),
      );

      const config = layer.getConfig();
      expect(config).not.toBeNull();
      expect(config!.features).toHaveLength(1);
      expect(config!.features[0].feature.properties.region).toBe(
        'New Region',
      );
    });
  });

  describe('destroy()', () => {
    it('clears all state', () => {
      layer.create(makeCollection([makeFeature()]));
      layer.destroy();

      expect(layer.getConfig()).toBeNull();
    });
  });

  describe('empty data handling', () => {
    it('handles empty feature collection', () => {
      const collection = makeCollection([]);
      const config = layer.create(collection) as GeoJsonLayerConfig;

      expect(config.type).toBe('geojson');
      expect(config.features).toHaveLength(0);
    });

    it('handles null/undefined data gracefully', () => {
      const config = layer.create(null) as GeoJsonLayerConfig;

      expect(config.type).toBe('geojson');
      expect(config.features).toHaveLength(0);
    });
  });
});
