/**
 * Tests for globe data adapter.
 * Verifies prediction-to-marker transformation, filtering,
 * color mapping, size scaling, and coordinate deduplication.
 */

import { describe, it, expect } from 'vitest';

import { predictionsToMarkers } from '../../src/core/globe-data-adapter.js';
import { PREDICTION_TYPE_COLORS } from '../../src/components/prediction-types.js';
import type { PredictionPoint } from '../../src/components/prediction-types.js';
import type { PredictionType } from '../../src/types.js';

function makePrediction(
  overrides: Partial<PredictionPoint> = {},
): PredictionPoint {
  return {
    id: 'pred-1',
    simulationId: 'sim-1',
    theater: 'Middle East',
    predictionType: 'escalation',
    summary: 'Tensions rising in the region',
    confidence: 0.85,
    timeHorizon: '30 days',
    supportingFactions: ['faction-a'],
    dissentingFactions: ['faction-b'],
    createdAt: '2026-04-07T00:00:00Z',
    ...overrides,
  };
}

describe('predictionsToMarkers', () => {
  it('should map a valid prediction to a marker with correct coords', () => {
    const predictions = [makePrediction()];
    const markers = predictionsToMarkers(predictions);

    expect(markers).toHaveLength(1);
    expect(markers[0].lat).toBeTypeOf('number');
    expect(markers[0].lng).toBeTypeOf('number');
    expect(markers[0].id).toBe('pred-1');
  });

  it('should skip predictions with unknown theater', () => {
    const predictions = [makePrediction({ theater: 'Atlantis' })];
    const markers = predictionsToMarkers(predictions);

    expect(markers).toHaveLength(0);
  });

  it('should return empty array for empty input', () => {
    const markers = predictionsToMarkers([]);
    expect(markers).toHaveLength(0);
  });

  it('should color markers by prediction type — escalation', () => {
    const predictions = [
      makePrediction({ predictionType: 'escalation' }),
    ];
    const markers = predictionsToMarkers(predictions);

    expect(markers[0].color).toBe(PREDICTION_TYPE_COLORS.escalation);
  });

  it('should color markers by prediction type — de_escalation', () => {
    const predictions = [
      makePrediction({ predictionType: 'de_escalation' }),
    ];
    const markers = predictionsToMarkers(predictions);

    expect(markers[0].color).toBe(PREDICTION_TYPE_COLORS.de_escalation);
  });

  it('should color markers by prediction type — market_shift', () => {
    const predictions = [
      makePrediction({ predictionType: 'market_shift' }),
    ];
    const markers = predictionsToMarkers(predictions);

    expect(markers[0].color).toBe(PREDICTION_TYPE_COLORS.market_shift);
  });

  it('should color markers by prediction type — sentiment_cascade', () => {
    const predictions = [
      makePrediction({ predictionType: 'sentiment_cascade' }),
    ];
    const markers = predictionsToMarkers(predictions);

    expect(markers[0].color).toBe(
      PREDICTION_TYPE_COLORS.sentiment_cascade,
    );
  });

  it('should scale marker size with confidence', () => {
    const lowConf = makePrediction({
      id: 'low',
      confidence: 0.0,
    });
    const highConf = makePrediction({
      id: 'high',
      confidence: 1.0,
      theater: 'Eastern Europe',
    });

    const markers = predictionsToMarkers([lowConf, highConf]);
    const lowMarker = markers.find((m) => m.id === 'low')!;
    const highMarker = markers.find((m) => m.id === 'high')!;

    expect(lowMarker.size).toBeCloseTo(0.3, 1);
    expect(highMarker.size).toBeCloseTo(1.0, 1);
  });

  it('should generate label with theater, type, and confidence', () => {
    const predictions = [
      makePrediction({ confidence: 0.85 }),
    ];
    const markers = predictionsToMarkers(predictions);

    expect(markers[0].label).toContain('Middle East');
    expect(markers[0].label).toContain('escalation');
    expect(markers[0].label).toContain('85%');
  });

  it('should jitter duplicate coordinates', () => {
    const pred1 = makePrediction({ id: 'p1' });
    const pred2 = makePrediction({ id: 'p2' });

    const markers = predictionsToMarkers([pred1, pred2]);

    expect(markers).toHaveLength(2);
    // At least one coordinate should differ due to jitter
    const sameCoords =
      markers[0].lat === markers[1].lat &&
      markers[0].lng === markers[1].lng;
    expect(sameCoords).toBe(false);
  });

  it('should handle multiple predictions across different theaters', () => {
    const predictions = [
      makePrediction({ id: 'p1', theater: 'Middle East' }),
      makePrediction({ id: 'p2', theater: 'South China Sea' }),
      makePrediction({ id: 'p3', theater: 'Arctic' }),
    ];
    const markers = predictionsToMarkers(predictions);

    expect(markers).toHaveLength(3);
    // All should have different coordinates (different theaters)
    const coords = markers.map((m) => `${m.lat},${m.lng}`);
    const unique = new Set(coords);
    expect(unique.size).toBe(3);
  });
});
