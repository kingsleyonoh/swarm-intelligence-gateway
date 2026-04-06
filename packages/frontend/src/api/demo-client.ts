/**
 * DemoApiClient — reads pre-computed demo data from static JSON files.
 *
 * Used when no API key is configured (demo mode). Implements the same
 * public API as SwarmApiClient but fetches from /demo/*.json files
 * instead of the live backend API.
 */

import type {
  PaginatedResponse,
  SimulationRow,
  PredictionRow,
  SimulationReportResponse,
  GetSimulationsParams,
  GetPredictionsParams,
  GetLatestPredictionsParams,
} from './types.js';

export class DemoApiClient {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath.replace(/\/$/, '');
  }

  async getSimulations(
    _params: GetSimulationsParams,
  ): Promise<PaginatedResponse<SimulationRow>> {
    return this.fetchJson<PaginatedResponse<SimulationRow>>(
      `${this.basePath}/simulations.json`,
    );
  }

  async getPredictions(
    _params: GetPredictionsParams,
  ): Promise<PaginatedResponse<PredictionRow>> {
    return this.fetchJson<PaginatedResponse<PredictionRow>>(
      `${this.basePath}/predictions.json`,
    );
  }

  async getLatestPredictions(
    _params: GetLatestPredictionsParams,
  ): Promise<{ data: PredictionRow[] }> {
    return this.fetchJson<{ data: PredictionRow[] }>(
      `${this.basePath}/predictions.json`,
    );
  }

  async getSimulationReport(
    _simulationId: string,
  ): Promise<SimulationReportResponse> {
    return this.fetchJson<SimulationReportResponse>(
      `${this.basePath}/report.json`,
    );
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Demo fetch failed: HTTP ${response.status} for ${url}`,
      );
    }
    return response.json() as Promise<T>;
  }
}
