/**
 * Data types consumed by the PredictionTimelinePanel.
 * Represents prediction data for the SVG timeline chart.
 */

import type { PredictionType } from '../types.js';

/** Color map for prediction type dots */
export const PREDICTION_TYPE_COLORS: Record<PredictionType, string> = {
  escalation: '#e05252',
  de_escalation: '#4a90d9',
  market_shift: '#d4a843',
  sentiment_cascade: '#9b59b6',
};

/** A single prediction data point for the timeline */
export interface PredictionPoint {
  id: string;
  simulationId: string;
  theater: string;
  predictionType: PredictionType;
  summary: string;
  confidence: number;
  timeHorizon: string;
  supportingFactions: string[];
  dissentingFactions: string[];
  createdAt: string;
}

/** Timeline data passed to the panel update() method */
export interface PredictionTimelineData {
  predictions: PredictionPoint[];
}
