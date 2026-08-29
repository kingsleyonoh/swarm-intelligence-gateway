import { createChildLogger } from '../shared/logger.js';

import type { MirofishRequestOptions } from './http.js';
import type { TaskStatusResponse } from './types.js';

const log = createChildLogger({ module: 'mirofish-polling' });

export interface PollingAdapter {
  request<T>(path: string, options: MirofishRequestOptions): Promise<T>;
}

export interface PollingIntervals {
  taskMs: number;
  simulationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrap(response: Record<string, unknown>): Record<string, unknown> {
  const data = response.data;
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : response;
}

function statusOf(data: Record<string, unknown>): string {
  return typeof data.status === 'string' ? data.status : '';
}

/** Polls all asynchronous MiroFish jobs behind one compact interface. */
export class MirofishPoller {
  constructor(
    private readonly adapter: PollingAdapter,
    private readonly intervals: PollingIntervals,
  ) {}

  async task(taskId: string, label: string, timeoutMs: number): Promise<TaskStatusResponse> {
    let completed: TaskStatusResponse | undefined;
    await this.until(taskId, label, timeoutMs, this.intervals.taskMs, async () => {
      const response = await this.adapter.request<Record<string, unknown>>(
        `/api/graph/task/${taskId}`,
        { method: 'GET' },
      );
      const data = unwrap(response) as TaskStatusResponse;
      if (data.status === 'complete' || data.status === 'completed') {
        completed = data;
        return true;
      }
      if (data.status === 'error' || data.status === 'failed') {
        throw new Error(`${label} failed: ${data.error ?? 'unknown error'}`);
      }
      log.debug({ taskId, label, status: data.status }, `${label} still processing`);
      return false;
    });
    if (!completed) throw new Error(`${label} completed without a status payload`);
    return completed;
  }

  async preparation(simulationId: string, timeoutMs: number): Promise<void> {
    await this.until(simulationId, 'Simulation preparation', timeoutMs, this.intervals.taskMs, async () => {
      const response = await this.adapter.request<Record<string, unknown>>(
        '/api/simulation/prepare/status',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ simulation_id: simulationId }),
        },
      );
      const data = unwrap(response);
      const status = statusOf(data);
      const ready = data.all_ready === true || status === 'ready' || status === 'completed';
      if (ready) return true;
      log.debug({ simulationId, data }, 'Simulation still preparing');
      return false;
    });
  }

  async simulation(simulationId: string, timeoutMs: number): Promise<void> {
    await this.until(simulationId, 'Simulation', timeoutMs, this.intervals.simulationMs, async () => {
      const response = await this.adapter.request<Record<string, unknown>>(
        `/api/simulation/${simulationId}/run-status`,
        { method: 'GET' },
      );
      const data = unwrap(response);
      const status = typeof data.runner_status === 'string' ? data.runner_status : statusOf(data);
      if (status === 'complete' || status === 'completed') return true;
      if (status === 'error' || status === 'failed') {
        throw new Error(`Simulation failed: ${data.error ?? 'unknown error'}`);
      }
      log.debug({ simulationId, status, progress: data.progress_percent ?? data.progress }, 'Simulation running');
      return false;
    });
  }

  async report(taskId: string, timeoutMs: number): Promise<void> {
    await this.until(taskId, 'Report generation', timeoutMs, this.intervals.taskMs, async () => {
      const response = await this.adapter.request<Record<string, unknown>>(
        '/api/report/generate/status',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ task_id: taskId }),
        },
      );
      const data = unwrap(response);
      const status = statusOf(data);
      if (status === 'complete' || status === 'completed' || data.report_id) return true;
      if (status === 'error' || status === 'failed') {
        throw new Error(`Report generation failed: ${data.error ?? 'unknown error'}`);
      }
      log.debug({ taskId, status }, 'Report still generating');
      return false;
    });
  }

  private async until(
    id: string,
    label: string,
    timeoutMs: number,
    intervalMs: number,
    check: () => Promise<boolean>,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) {
        log.info({ id, label }, `${label} complete`);
        return;
      }
      await sleep(intervalMs);
    }
    throw new Error(`${label} timed out after ${timeoutMs}ms for ${id}`);
  }
}
