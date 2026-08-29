import * as Sentry from '@sentry/node';

import { env } from '../config/env.js';

let telemetryEnabled = false;

/** Initialize error telemetry when a deployment supplies a Sentry DSN. */
export function initTelemetry(): boolean {
  if (!env.SENTRY_DSN || telemetryEnabled) return telemetryEnabled;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  telemetryEnabled = true;
  return true;
}

/** Send an exception with operational context without affecting the request path. */
export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!telemetryEnabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) scope.setExtra(key, value);
    Sentry.captureException(error);
  });
}

/** Flush queued events before a graceful process exit. */
export async function flushTelemetry(timeoutMs = 2_000): Promise<void> {
  if (telemetryEnabled) await Sentry.flush(timeoutMs);
}
