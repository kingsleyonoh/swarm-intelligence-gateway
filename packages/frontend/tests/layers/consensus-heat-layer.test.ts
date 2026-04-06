import { describe, it, expect, beforeEach } from 'vitest';

import { ConsensusHeatLayer } from '../../src/layers/ConsensusHeatLayer.js';
import type {
  HeatmapPoint,
  HeatmapLayerConfig,
} from '../../src/layers/heatmap-layer-types.js';
import type { MapLayer } from '../../src/types.js';

function makeHeatmapPoint(
  overrides: Partial<HeatmapPoint> = {},
): HeatmapPoint {
  return {
    lat: 33.3,
    lng: 44.4,
    intensity: 0.85,
    type: 'escalation',
    predictionId: 'pred-1',
    ...overrides,
  };
}

describe('ConsensusHeatLayer', () => {
  let layer: ConsensusHeatLayer;

  beforeEach(() => {
    layer = new ConsensusHeatLayer();
  });

  it('has correct id "consensus-heat"', () => {
    expect(layer.id).toBe('consensus-heat');
  });

  it('has correct type "heatmap"', () => {
    expect(layer.type).toBe('heatmap');
  });

  it('implements MapLayer interface', () => {
    const mapLayer: MapLayer = layer;
    expect(mapLayer.id).toBe('consensus-heat');
    expect(typeof mapLayer.create).toBe('function');
    expect(typeof mapLayer.update).toBe('function');
    expect(typeof mapLayer.destroy).toBe('function');
  });

  describe('create()', () => {
    it('processes heatmap points into weighted configs', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint(),
        makeHeatmapPoint({
          lat: 48.8,
          lng: 2.3,
          type: 'de_escalation',
          predictionId: 'pred-2',
        }),
      ];

      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.type).toBe('heatmap');
      expect(config.points).toHaveLength(2);
    });

    it('sets position from lat/lng', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ lat: 33.3, lng: 44.4 }),
      ];

      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points[0].position).toEqual([44.4, 33.3]);
    });

    it('uses intensity as weight', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ intensity: 0.9 }),
      ];

      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points[0].weight).toBeCloseTo(0.9);
    });

    it('categorizes escalation type as "escalation"', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ type: 'escalation' }),
      ];

      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points[0].colorCategory).toBe('escalation');
    });

    it('categorizes de_escalation type as "de_escalation"', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ type: 'de_escalation' }),
      ];

      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points[0].colorCategory).toBe('de_escalation');
    });

    it('categorizes other types as "other"', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ type: 'market_shift' }),
        makeHeatmapPoint({ type: 'sentiment_cascade', predictionId: 'pred-2' }),
      ];

      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points[0].colorCategory).toBe('other');
      expect(config.points[1].colorCategory).toBe('other');
    });

    it('defaults to enabled=false', () => {
      const config = layer.create([]) as HeatmapLayerConfig;

      expect(config.enabled).toBe(false);
    });

    it('defaults threshold to 0.5', () => {
      const config = layer.create([]) as HeatmapLayerConfig;

      expect(config.threshold).toBe(0.5);
    });
  });

  describe('threshold filtering', () => {
    it('filters out points below threshold', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ intensity: 0.8, predictionId: 'high' }),
        makeHeatmapPoint({ intensity: 0.3, predictionId: 'low' }),
        makeHeatmapPoint({ intensity: 0.6, predictionId: 'mid' }),
      ];

      layer.setThreshold(0.5);
      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points).toHaveLength(2);
      expect(config.threshold).toBe(0.5);
    });

    it('includes points equal to threshold', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ intensity: 0.5, predictionId: 'exact' }),
      ];

      layer.setThreshold(0.5);
      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points).toHaveLength(1);
    });

    it('threshold 0 includes all points', () => {
      const points: HeatmapPoint[] = [
        makeHeatmapPoint({ intensity: 0.1, predictionId: 'low' }),
        makeHeatmapPoint({ intensity: 0.9, predictionId: 'high' }),
      ];

      layer.setThreshold(0);
      const config = layer.create(points) as HeatmapLayerConfig;

      expect(config.points).toHaveLength(2);
    });
  });

  describe('enable/disable', () => {
    it('setEnabled updates config enabled flag', () => {
      layer.create([]);
      layer.setEnabled(true);

      const config = layer.getConfig();
      expect(config!.enabled).toBe(true);
    });

    it('setEnabled(false) disables', () => {
      layer.create([]);
      layer.setEnabled(true);
      layer.setEnabled(false);

      const config = layer.getConfig();
      expect(config!.enabled).toBe(false);
    });
  });

  describe('applySettings()', () => {
    it('applies heatmap-settings-change event detail', () => {
      layer.create([makeHeatmapPoint()]);

      layer.applySettings({ enabled: true, intensityThreshold: 0.7 });

      const config = layer.getConfig();
      expect(config!.enabled).toBe(true);
      expect(config!.threshold).toBe(0.7);
    });
  });

  describe('update()', () => {
    it('updates stored points with new data', () => {
      layer.create([makeHeatmapPoint()]);

      layer.update([
        makeHeatmapPoint({ intensity: 0.95, predictionId: 'new' }),
      ]);

      const config = layer.getConfig();
      expect(config).not.toBeNull();
      expect(config!.points).toHaveLength(1);
      expect(config!.points[0].weight).toBeCloseTo(0.95);
    });
  });

  describe('destroy()', () => {
    it('clears all state', () => {
      layer.create([makeHeatmapPoint()]);
      layer.destroy();

      expect(layer.getConfig()).toBeNull();
    });
  });

  describe('empty data handling', () => {
    it('handles empty points array', () => {
      const config = layer.create([]) as HeatmapLayerConfig;

      expect(config.type).toBe('heatmap');
      expect(config.points).toHaveLength(0);
    });

    it('handles null/undefined data gracefully', () => {
      const config = layer.create(null) as HeatmapLayerConfig;

      expect(config.type).toBe('heatmap');
      expect(config.points).toHaveLength(0);
    });
  });
});
