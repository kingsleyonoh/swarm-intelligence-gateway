/**
 * Types for WorldMonitor live intelligence data.
 *
 * Story tracks represent trending news stories being monitored.
 * Forecast predictions represent forward-looking probability assessments.
 */

export interface StoryTrack {
  title: string;
  link: string;
  currentScore: number;
  severity: string;
  lastSeen: number;
}

export interface ForecastPrediction {
  id: string;
  domain: string;
  region: string;
  title: string;
  probability: number;
  confidence: number;
  timeHorizon: string;
  signalCount: number;
}

export interface IntelligencePayload {
  stories: StoryTrack[];
  forecasts: ForecastPrediction[];
  fetchedAt: string;
}
