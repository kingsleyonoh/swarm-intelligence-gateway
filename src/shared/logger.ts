import pino from 'pino';

import { env } from '../config/env.js';

/**
 * Root Pino structured logger.
 *
 * - Uses `pino-pretty` transport in development for human-readable output.
 * - JSON output in production / test for structured log aggregation.
 * - Base bindings include `service: 'swarm-gateway'` on every log line.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  base: { service: 'swarm-gateway' },
});

/**
 * Create a child logger with additional context bindings.
 *
 * Usage:
 * ```ts
 * const log = createChildLogger({ module: 'poller', tenantId });
 * log.info('Polling started');
 * ```
 */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
