import { request } from 'undici';

import { createChildLogger } from '../shared/logger.js';

import {
  normalizeAction,
  normalizeGraphData,
  normalizeProfiles,
  parseActionLogJsonl,
} from './remote-data.js';
import type { MirofishRequestOptions } from './http.js';
import type {
  ActionLogEntry,
  MirofishAgentProfile,
  MirofishGraphData,
} from './types.js';

const log = createChildLogger({ module: 'mirofish-data-client' });

export interface DataRequest {
  request<T>(path: string, options: MirofishRequestOptions): Promise<T>;
}

/** Reads completed simulation data and normalizes upstream response variants. */
export class MirofishDataClient {
  constructor(
    private readonly adapter: DataRequest,
    private readonly baseUrl: string,
  ) {}

  async fetchActionLog(simulationId: string): Promise<ActionLogEntry[]> {
    try {
      const response = await this.adapter.request<Record<string, unknown>>(
        `/api/simulation/${simulationId}/actions`,
        { method: 'GET' },
      );
      const data = response.data as Record<string, unknown> | undefined;
      const actions = Array.isArray(data?.actions) ? data.actions : [];
      const normalized = actions
        .map((action) => normalizeAction(action))
        .filter((action): action is ActionLogEntry => action !== null);
      if (normalized.length > 0) return normalized;
    } catch (error) {
      log.debug({ simulationId, error: errorMessage(error) }, 'Action log API failed; trying file fallback');
    }

    return this.fetchActionLogFile(simulationId);
  }

  async fetchProfiles(simulationId: string): Promise<MirofishAgentProfile[]> {
    try {
      const response = await this.adapter.request<Record<string, unknown>>(
        `/api/simulation/${simulationId}/profiles`,
        { method: 'GET' },
      );
      const profiles = normalizeProfiles(response);
      if (profiles.length > 0) return profiles;
      log.warn({ simulationId }, 'MiroFish returned no agent profiles');
    } catch (error) {
      log.warn({ simulationId, error: errorMessage(error) }, 'Agent profiles unavailable from MiroFish');
    }
    return [];
  }

  async fetchGraphData(projectId: string): Promise<MirofishGraphData> {
    const response = await this.adapter.request<Record<string, unknown>>(
      `/api/graph/data/${projectId}`,
      { method: 'GET' },
    );
    return normalizeGraphData(response);
  }

  private async fetchActionLogFile(simulationId: string): Promise<ActionLogEntry[]> {
    const fileUrl = `${this.baseUrl}/uploads/simulations/${simulationId}/twitter/actions.jsonl`;
    try {
      const response = await request(fileUrl, { method: 'GET' });
      if (response.statusCode !== 200) {
        log.warn({ simulationId, statusCode: response.statusCode }, 'MiroFish action log file unavailable');
        return [];
      }
      const parsed = parseActionLogJsonl(await response.body.text());
      if (parsed.malformedLines > 0) {
        log.warn({ simulationId, malformedLines: parsed.malformedLines }, 'Skipped malformed MiroFish action log lines');
      }
      if (parsed.entries.length > 0) {
        log.info({ simulationId, count: parsed.entries.length }, 'Loaded action log from MiroFish file');
      }
      return parsed.entries;
    } catch (error) {
      log.warn({ simulationId, error: errorMessage(error) }, 'MiroFish action log file fallback failed');
      return [];
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
