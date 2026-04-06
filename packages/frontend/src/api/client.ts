/**
 * SwarmApiClient — HTTP client for the Swarm Gateway REST API.
 *
 * All methods return typed responses. Non-2xx responses throw errors.
 * Configurable base URL and API key for tenant authentication.
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

export interface SwarmApiClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class SwarmApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: SwarmApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  async getSimulations(
    params: GetSimulationsParams,
  ): Promise<PaginatedResponse<SimulationRow>> {
    const qs = buildQuery(params);
    return this.fetchJson<PaginatedResponse<SimulationRow>>(
      `/api/simulations${qs}`,
    );
  }

  async getSimulationReport(
    simulationId: string,
  ): Promise<SimulationReportResponse> {
    return this.fetchJson<SimulationReportResponse>(
      `/api/simulations/${simulationId}/report`,
    );
  }

  async getPredictions(
    params: GetPredictionsParams,
  ): Promise<PaginatedResponse<PredictionRow>> {
    const qs = buildQuery(params);
    return this.fetchJson<PaginatedResponse<PredictionRow>>(
      `/api/predictions${qs}`,
    );
  }

  async getLatestPredictions(
    params: GetLatestPredictionsParams,
  ): Promise<{ data: PredictionRow[] }> {
    const qs = buildQuery(params);
    return this.fetchJson<{ data: PredictionRow[] }>(
      `/api/predictions/latest${qs}`,
    );
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

}

function buildQuery(
  params: object,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return '';
  const qs = entries
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join('&');
  return `?${qs}`;
}
