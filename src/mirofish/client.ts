/**
 * MiroFish HTTP Client.
 *
 * Communicates with the MiroFish Flask API to drive ontology generation,
 * graph building, simulation execution, and report retrieval.
 *
 * Retry logic: connection errors (ECONNREFUSED, ETIMEDOUT) trigger
 * exponential backoff retries (1s, 2s, 4s). HTTP errors (4xx, 5xx)
 * are not retried — they indicate application-level failures.
 */

import { request, FormData } from 'undici';

import { createChildLogger } from '../shared/logger.js';

import type {
  BuildResponse,
  MirofishConfig,
  OntologyGenerateResponse,
  OntologyStatusResponse,
  SimulationReportResponse,
  SimulationStartResponse,
  SimulationStatusResponse,
} from './types.js';

const log = createChildLogger({ module: 'mirofish-client' });

// ── Retry Helpers ─────────────────────────────────────────────────────

/** Error codes that indicate a connection-level failure worth retrying. */
const RETRYABLE_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET']);

/** Check whether an error is a retryable connection failure. */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_CODES.has(code)) return true;
  }
  return false;
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Client Configuration ─────────────────────────────────────────────

export interface MirofishClientOptions {
  /** Maximum retry attempts for connection errors (default: 3). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000). */
  retryBaseDelayMs?: number;
  /** Poll interval for ontology status in ms (default: 5000). */
  ontologyPollIntervalMs?: number;
  /** Poll interval for simulation status in ms (default: 10000). */
  simulationPollIntervalMs?: number;
}

// ── Client Class ──────────────────────────────────────────────────────

export class MirofishClient {
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly ontologyPollIntervalMs: number;
  private readonly simulationPollIntervalMs: number;

  constructor(
    private readonly baseUrl: string,
    options: MirofishClientOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;
    this.ontologyPollIntervalMs = options.ontologyPollIntervalMs ?? 5000;
    this.simulationPollIntervalMs = options.simulationPollIntervalMs ?? 10_000;
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Upload seed document and generate ontology.
   *
   * `POST /ontology/generate` — multipart/form-data with seed document
   * file, simulation requirement text, and project name.
   */
  async generateOntology(
    seedDocument: string,
    simulationRequirement: string,
    projectName: string,
  ): Promise<OntologyGenerateResponse> {
    const formData = new FormData();
    const blob = new Blob([seedDocument], { type: 'text/markdown' });
    formData.append('files', blob, 'seed_document.md');
    formData.append('simulation_requirement', simulationRequirement);
    formData.append('project_name', projectName);

    return this.requestWithRetry<OntologyGenerateResponse>(
      `${this.baseUrl}/ontology/generate`,
      { method: 'POST', body: formData },
    );
  }

  /**
   * Poll ontology status until complete or timeout.
   *
   * `GET /ontology/status/:projectId` — polls every 5 seconds.
   *
   * @param projectId - MiroFish project ID
   * @param timeoutMs - Maximum wait time (default 10 minutes)
   */
  async pollOntologyStatus(
    projectId: string,
    timeoutMs: number = 600_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.requestWithRetry<OntologyStatusResponse>(
        `${this.baseUrl}/ontology/status/${projectId}`,
        { method: 'GET' },
      );

      if (status.status === 'complete') {
        log.info({ projectId }, 'Ontology generation complete');
        return;
      }

      if (status.status === 'error') {
        throw new Error(
          `Ontology generation failed: ${status.error ?? 'unknown error'}`,
        );
      }

      log.debug({ projectId, status: status.status }, 'Ontology still processing');
      await sleep(this.ontologyPollIntervalMs);
    }

    throw new Error(
      `Ontology generation timed out after ${timeoutMs}ms for project ${projectId}`,
    );
  }

  /**
   * Build the knowledge graph from the generated ontology.
   *
   * `POST /build` — JSON `{ project_id }`.
   */
  async buildGraph(projectId: string): Promise<BuildResponse> {
    return this.requestWithRetry<BuildResponse>(
      `${this.baseUrl}/build`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      },
    );
  }

  /**
   * Start a swarm simulation.
   *
   * `POST /simulation/start` — JSON `{ project_id, config }`.
   */
  async startSimulation(
    projectId: string,
    config: MirofishConfig,
  ): Promise<SimulationStartResponse> {
    return this.requestWithRetry<SimulationStartResponse>(
      `${this.baseUrl}/simulation/start`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, config }),
      },
    );
  }

  /**
   * Poll simulation status until complete or timeout.
   *
   * `GET /simulation/status/:simId` — polls every 10 seconds.
   *
   * @param simId - MiroFish simulation ID
   * @param timeoutMs - Maximum wait time (default 30 minutes)
   */
  async pollSimulationStatus(
    simId: string,
    timeoutMs: number = 1_800_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.requestWithRetry<SimulationStatusResponse>(
        `${this.baseUrl}/simulation/status/${simId}`,
        { method: 'GET' },
      );

      if (status.status === 'complete') {
        log.info({ simId }, 'Simulation complete');
        return;
      }

      if (status.status === 'error') {
        throw new Error(
          `Simulation failed: ${status.error ?? 'unknown error'}`,
        );
      }

      log.debug({ simId, status: status.status, progress: status.progress }, 'Simulation running');
      await sleep(this.simulationPollIntervalMs);
    }

    throw new Error(
      `Simulation timed out after ${timeoutMs}ms for simulation ${simId}`,
    );
  }

  /**
   * Retrieve the simulation report.
   *
   * `GET /simulation/report/:projectId`
   */
  async getReport(projectId: string): Promise<SimulationReportResponse> {
    return this.requestWithRetry<SimulationReportResponse>(
      `${this.baseUrl}/simulation/report/${projectId}`,
      { method: 'GET' },
    );
  }

  // ── Private Helpers ───────────────────────────────────────────────

  /**
   * Execute an HTTP request with retry logic for connection errors.
   *
   * Retries up to `maxRetries` times with exponential backoff (1s, 2s, 4s).
   * Only retries on connection-level errors (ECONNREFUSED, ETIMEDOUT, etc.).
   * HTTP status errors (4xx, 5xx) are thrown immediately.
   */
  private async requestWithRetry<T>(
    url: string,
    options: Parameters<typeof request>[1],
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await request(url, options);

        if (response.statusCode >= 400) {
          const bodyText = await response.body.text();
          throw new Error(
            `MiroFish API error: ${response.statusCode} — ${bodyText}`,
          );
        }

        return (await response.body.json()) as T;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (isRetryableError(error) && attempt < this.maxRetries - 1) {
          const delayMs = this.retryBaseDelayMs * Math.pow(2, attempt);
          log.warn(
            { url, attempt: attempt + 1, maxRetries: this.maxRetries, delayMs },
            'Retrying after connection error',
          );
          await sleep(delayMs);
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error('Request failed after all retries');
  }
}
