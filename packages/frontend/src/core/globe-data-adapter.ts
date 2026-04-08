/**
 * Globe data adapter — transforms PredictionPoint arrays into GlobeMarker arrays.
 * Handles theater resolution, color mapping, size scaling, and coordinate deduplication.
 */

import type { GlobeMarker } from './globe-types.js';
import type { PredictionPoint } from '../components/prediction-types.js';
import type { IntelForecast } from '../components/intelligence-types.js';
import { PREDICTION_TYPE_COLORS } from '../components/prediction-types.js';
import { resolveTheaterCoords } from '../geo/theater-coords.js';

/** Jitter offset for duplicate coordinates (degrees) */
const JITTER_RANGE = 0.5;

/** Minimum marker size at confidence=0 */
const MIN_SIZE = 0.6;

/** Size range added at confidence=1 */
const SIZE_RANGE = 1.2;

/**
 * Convert an array of PredictionPoints to GlobeMarkers.
 * Skips predictions whose theater cannot be resolved to coordinates.
 * Applies jitter to markers that share the same coordinates.
 */
/**
 * Group predictions by theater, keep only the highest confidence per theater.
 * This prevents flickering tooltips from duplicate markers at the same location.
 */
export function predictionsToMarkers(
  predictions: PredictionPoint[],
): GlobeMarker[] {
  // Group by theater — keep the highest confidence prediction per theater
  const byTheater = new Map<string, PredictionPoint>();
  for (const p of predictions) {
    const existing = byTheater.get(p.theater);
    if (!existing || p.confidence > existing.confidence) {
      byTheater.set(p.theater, p);
    }
  }

  const markers: GlobeMarker[] = [];
  for (const prediction of byTheater.values()) {
    const coords = resolveTheaterCoords(prediction.theater);
    if (!coords) continue;

    const color = PREDICTION_TYPE_COLORS[prediction.predictionType];
    const size = MIN_SIZE + prediction.confidence * SIZE_RANGE;
    const confidencePct = Math.round(prediction.confidence * 100);
    const label = `${prediction.theater}: ${prediction.predictionType} (${confidencePct}%)`;

    markers.push({
      id: prediction.id,
      lat: coords.lat,
      lng: coords.lng,
      label,
      color,
      size,
    });
  }

  return markers;
}

/**
 * Convert an array of IntelForecasts to small gray GlobeMarkers.
 * Skips forecasts whose region cannot be resolved to coordinates.
 */
export function forecastsToMarkers(
  forecasts: IntelForecast[],
): GlobeMarker[] {
  const markers: GlobeMarker[] = [];
  const coordCounts = new Map<string, number>();

  for (const forecast of forecasts) {
    const coords = resolveTheaterCoords(forecast.region);
    if (!coords) continue;

    const coordKey = `${coords.lat},${coords.lng}`;
    const count = coordCounts.get(coordKey) ?? 0;
    coordCounts.set(coordKey, count + 1);

    const jitteredLat = applyJitter(coords.lat, count);
    const jitteredLng = applyJitter(coords.lng, count);

    markers.push({
      id: `intel-${forecast.id}`,
      lat: jitteredLat,
      lng: jitteredLng,
      label: `${forecast.region}: ${forecast.title}`,
      color: '#D8CEBC',
      size: 0.35,
    });
  }

  return markers;
}

/**
 * Apply deterministic jitter to a coordinate based on the count
 * of previously seen markers at the same base coordinates.
 * First marker (count=0) gets no jitter, subsequent ones are offset.
 */
function applyJitter(coord: number, index: number): number {
  if (index === 0) return coord;

  // Spread markers in a circle around the base point
  const angle = (index * 137.5 * Math.PI) / 180; // golden angle
  const offset = JITTER_RANGE * Math.sqrt(index) * 0.5;
  return coord + offset * Math.cos(angle);
}
