import { describe, it, expect, beforeEach } from 'vitest';

import { SwarmPredictionsLayer } from '../../src/layers/SwarmPredictionsLayer.js';
import type {
  PredictionPoint,
  ScatterplotLayerConfig,
} from '../../src/layers/prediction-layer-types.js';
import {
  PREDICTION_TYPE_COLORS,
  DEFAULT_PREDICTION_COLOR,
} from '../../src/layers/prediction-layer-types.js';
import type { MapLayer } from '../../src/types.js';

function makePredictionPoint(
  overrides: Partial<PredictionPoint> = {},
): PredictionPoint {
  return {
    lat: 33.3,
    lng: 44.4,
    confidence: 0.85,
    type: 'escalation',
    summary: 'Tensions rising in region',
    theater: 'Middle East',
    predictionId: 'pred-1',
    ...overrides,
  };
}

describe('SwarmPredictionsLayer', () => {
  let layer: SwarmPredictionsLayer;

  beforeEach(() => {
    layer = new SwarmPredictionsLayer();
  });

  it('has correct id "swarm-predictions"', () => {
    expect(layer.id).toBe('swarm-predictions');
  });

  it('has correct type "scatterplot"', () => {
    expect(layer.type).toBe('scatterplot');
  });

  it('implements MapLayer interface', () => {
    const mapLayer: MapLayer = layer;
    expect(mapLayer.id).toBe('swarm-predictions');
    expect(typeof mapLayer.create).toBe('function');
    expect(typeof mapLayer.update).toBe('function');
    expect(typeof mapLayer.destroy).toBe('function');
  });

  describe('create()', () => {
    it('processes predictions into scatterplot point configs', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint(),
        makePredictionPoint({
          lat: 48.8,
          lng: 2.3,
          type: 'market_shift',
          confidence: 0.6,
          predictionId: 'pred-2',
        }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;

      expect(config.type).toBe('scatterplot');
      expect(config.points).toHaveLength(2);
    });

    it('sets position from lat/lng', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint({ lat: 33.3, lng: 44.4 }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;

      expect(config.points[0].position).toEqual([44.4, 33.3]);
    });

    it('computes radius as confidence * 50', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint({ confidence: 0.85 }),
        makePredictionPoint({ confidence: 0.4, predictionId: 'pred-2' }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;

      expect(config.points[0].radius).toBeCloseTo(42.5);
      expect(config.points[1].radius).toBeCloseTo(20);
    });

    it('maps escalation type to red color', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint({ type: 'escalation' }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;
      const [r, g, b] = config.points[0].color;

      // #e05252 -> [224, 82, 82]
      expect(r).toBe(224);
      expect(g).toBe(82);
      expect(b).toBe(82);
    });

    it('maps de_escalation type to blue color', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint({ type: 'de_escalation' }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;
      const [r, g, b] = config.points[0].color;

      // #4a90d9 -> [74, 144, 217]
      expect(r).toBe(74);
      expect(g).toBe(144);
      expect(b).toBe(217);
    });

    it('maps market_shift type to gold color', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint({ type: 'market_shift' }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;
      const [r, g, b] = config.points[0].color;

      // #d4a843 -> [212, 168, 67]
      expect(r).toBe(212);
      expect(g).toBe(168);
      expect(b).toBe(67);
    });

    it('maps sentiment_cascade type to purple color', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint({ type: 'sentiment_cascade' }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;
      const [r, g, b] = config.points[0].color;

      // #9b59b6 -> [155, 89, 182]
      expect(r).toBe(155);
      expect(g).toBe(89);
      expect(b).toBe(182);
    });

    it('uses default gray for unknown prediction type', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint({ type: 'unknown_type' }),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;
      const [r, g, b] = config.points[0].color;

      // #888888 -> [136, 136, 136]
      expect(r).toBe(136);
      expect(g).toBe(136);
      expect(b).toBe(136);
    });

    it('sets alpha to 200 in color tuple', () => {
      const predictions: PredictionPoint[] = [
        makePredictionPoint(),
      ];

      const config = layer.create(predictions) as ScatterplotLayerConfig;

      expect(config.points[0].color[3]).toBe(200);
    });

    it('preserves original prediction point reference', () => {
      const point = makePredictionPoint();
      const config = layer.create([point]) as ScatterplotLayerConfig;

      expect(config.points[0].point).toBe(point);
    });
  });

  describe('update()', () => {
    it('updates stored points with new data', () => {
      const initial: PredictionPoint[] = [makePredictionPoint()];
      layer.create(initial);

      const updated: PredictionPoint[] = [
        makePredictionPoint({ confidence: 0.9, predictionId: 'pred-new' }),
      ];
      layer.update(updated);

      const config = layer.getConfig();
      expect(config).not.toBeNull();
      expect(config!.points).toHaveLength(1);
      expect(config!.points[0].radius).toBeCloseTo(45);
    });
  });

  describe('destroy()', () => {
    it('clears all state', () => {
      layer.create([makePredictionPoint()]);
      layer.destroy();

      expect(layer.getConfig()).toBeNull();
    });
  });

  describe('empty data handling', () => {
    it('handles empty predictions array', () => {
      const config = layer.create([]) as ScatterplotLayerConfig;

      expect(config.type).toBe('scatterplot');
      expect(config.points).toHaveLength(0);
    });

    it('handles null/undefined data gracefully', () => {
      const config = layer.create(null) as ScatterplotLayerConfig;

      expect(config.type).toBe('scatterplot');
      expect(config.points).toHaveLength(0);
    });
  });
});
