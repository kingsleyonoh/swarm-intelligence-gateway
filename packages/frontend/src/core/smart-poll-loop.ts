import type { PollConfig } from '../types.js';

/**
 * SmartPollLoop — generic polling utility following WorldMonitor's pattern.
 *
 * Polls a URL at a configurable interval. On error, applies exponential
 * backoff. After maxErrors consecutive failures, stops automatically.
 * A successful response resets the error count and backoff.
 *
 * Uses the Fetch API with AbortController for clean cancellation.
 */
export class SmartPollLoop<T = unknown> {
  private readonly url: string;
  private readonly baseIntervalMs: number;
  private readonly onData: (data: T) => void;
  private readonly onError?: (error: Error) => void;
  private readonly maxErrors: number;
  private readonly backoffMultiplier: number;
  private readonly fetchOptions: RequestInit;

  private running = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private consecutiveErrors = 0;
  private currentIntervalMs: number;

  constructor(config: PollConfig<T>) {
    this.url = config.url;
    this.baseIntervalMs = config.intervalMs;
    this.currentIntervalMs = config.intervalMs;
    this.onData = config.onData;
    this.onError = config.onError;
    this.maxErrors = config.maxErrors ?? 5;
    this.backoffMultiplier = config.backoffMultiplier ?? 1.5;
    this.fetchOptions = config.fetchOptions ?? {};
  }

  /** Start polling. No-op if already running. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.consecutiveErrors = 0;
    this.currentIntervalMs = this.baseIntervalMs;
    this.poll();
  }

  /** Stop polling. No-op if not running. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /** Whether the loop is currently active. */
  isRunning(): boolean {
    return this.running;
  }

  private poll(): void {
    if (!this.running) return;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    fetch(this.url, { ...this.fetchOptions, signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${response.statusText}`,
          );
        }
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (!this.running) return;
        this.consecutiveErrors = 0;
        this.currentIntervalMs = this.baseIntervalMs;
        this.onData(data);
        this.scheduleNext();
      })
      .catch((error: unknown) => {
        if (!this.running) return;
        const err =
          error instanceof Error ? error : new Error(String(error));
        this.consecutiveErrors++;
        this.onError?.(err);

        if (this.consecutiveErrors >= this.maxErrors) {
          this.running = false;
          return;
        }

        // Apply backoff
        this.currentIntervalMs *= this.backoffMultiplier;
        this.scheduleNext();
      });
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timerId = setTimeout(() => this.poll(), this.currentIntervalMs);
  }
}
