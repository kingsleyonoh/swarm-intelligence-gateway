import { FormData } from 'undici';

import { env } from '../config/env.js';

import { MirofishDataClient } from './data-client.js';
import { requestWithRetry, type HttpRetryOptions, type MirofishRequestOptions } from './http.js';
import { MirofishPoller } from './polling.js';

import type {
  ActionLogEntry,
  BuildResponse,
  MirofishAgentProfile,
  MirofishConfig,
  MirofishGraphData,
  OntologyGenerateResponse,
  SimulationCreateResponse,
  SimulationReportResponse,
  SimulationStartResponse,
  TaskStatusResponse,
} from './types.js';

export interface MirofishClientOptions extends Partial<HttpRetryOptions> {
  ontologyPollIntervalMs?: number;
  simulationPollIntervalMs?: number;
}

/** Deep adapter for the MiroFish HTTP workflow. */
export class MirofishClient {
  private readonly retry: HttpRetryOptions;
  private readonly poller: MirofishPoller;
  private readonly data: MirofishDataClient;

  constructor(
    private readonly baseUrl: string,
    options: MirofishClientOptions = {},
  ) {
    this.retry = {
      maxRetries: options.maxRetries ?? 3,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 1000,
    };
    const adapter = { request: this.request.bind(this) };
    this.poller = new MirofishPoller(adapter, {
      taskMs: options.ontologyPollIntervalMs ?? 5000,
      simulationMs: options.simulationPollIntervalMs ?? 10_000,
    });
    this.data = new MirofishDataClient(adapter, baseUrl);
  }

  async generateOntology(
    seedDocument: string,
    requirement: string,
    projectName: string,
    additionalContext?: string,
  ): Promise<OntologyGenerateResponse> {
    const form = new FormData();
    form.append('files', new Blob([seedDocument], { type: 'text/markdown' }), 'seed_document.md');
    form.append('simulation_requirement', requirement);
    form.append('project_name', projectName);
    if (additionalContext) form.append('additional_context', additionalContext);
    return this.request('/api/graph/ontology/generate', { method: 'POST', body: form });
  }

  buildGraph(projectId: string): Promise<BuildResponse> {
    return this.json('/api/graph/build', { project_id: projectId });
  }

  createSimulation(projectId: string): Promise<SimulationCreateResponse> {
    return this.json('/api/simulation/create', { project_id: projectId });
  }

  prepareSimulation(simulationId: string): Promise<Record<string, unknown>> {
    return this.json('/api/simulation/prepare', { simulation_id: simulationId });
  }

  startSimulation(simulationId: string, config: MirofishConfig): Promise<SimulationStartResponse> {
    return this.json('/api/simulation/start', {
      simulation_id: simulationId,
      agent_count: config.agentCount,
      round_count: config.roundCount,
    });
  }

  generateReport(simulationId: string): Promise<Record<string, unknown>> {
    return this.json('/api/report/generate', { simulation_id: simulationId });
  }

  async getReport(simulationId: string): Promise<SimulationReportResponse> {
    const response = await this.request<Record<string, unknown>>(
      `/api/report/by-simulation/${simulationId}`,
      { method: 'GET' },
    );
    const data = unwrap(response);
    const report = typeof data.markdown_content === 'string' ? data.markdown_content
      : typeof data.content === 'string' ? data.content
      : typeof data.report === 'string' ? data.report
      : JSON.stringify(data);
    return { report };
  }

  pollTask(taskId: string, label = 'Task', timeoutMs = 600_000): Promise<TaskStatusResponse> {
    return this.poller.task(taskId, label, timeoutMs);
  }

  pollPrepareStatus(simulationId: string, timeoutMs = 600_000): Promise<void> {
    return this.poller.preparation(simulationId, timeoutMs);
  }

  pollSimulationStatus(simulationId: string, timeoutMs = 1_800_000): Promise<void> {
    return this.poller.simulation(simulationId, timeoutMs);
  }

  pollReportStatus(taskId: string, timeoutMs = 600_000): Promise<void> {
    return this.poller.report(taskId, timeoutMs);
  }

  fetchActionLog(simulationId: string): Promise<ActionLogEntry[]> {
    return this.data.fetchActionLog(simulationId);
  }

  fetchProfiles(simulationId: string): Promise<MirofishAgentProfile[]> {
    return this.data.fetchProfiles(simulationId);
  }

  fetchGraphData(projectId: string): Promise<MirofishGraphData> {
    return this.data.fetchGraphData(projectId);
  }

  private request<T>(path: string, options: MirofishRequestOptions): Promise<T> {
    return requestWithRetry<T>(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'accept-language': 'en',
        ...(options.headers as Record<string, string> | undefined),
      },
    }, this.retry);
  }

  private json<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

function unwrap(response: Record<string, unknown>): Record<string, unknown> {
  const data = response.data;
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : response;
}

export function createConfiguredMirofishClient(options?: MirofishClientOptions): MirofishClient {
  return new MirofishClient(env.MIROFISH_API_URL ?? 'http://127.0.0.1:5000', options);
}
