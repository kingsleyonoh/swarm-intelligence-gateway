/**
 * Type definitions for the intelligence feed (stories + forecasts).
 * Consumed by the IntelligenceTicker and DataBridge transforms.
 */

export interface IntelStory {
  title: string;
  link: string;
  severity: string;
  currentScore: number;
}

export interface IntelForecast {
  id: string;
  region: string;
  title: string;
  probability: number;
  signalCount: number;
}

export interface IntelligenceData {
  stories: IntelStory[];
  forecasts: IntelForecast[];
  fetchedAt: string;
}
