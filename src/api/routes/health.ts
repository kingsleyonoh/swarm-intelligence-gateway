import type { FastifyInstance } from 'fastify';

import { db } from '../../shared/db.js';
import { redis } from '../../shared/redis.js';
import { env } from '../../config/env.js';
import { createChildLogger } from '../../shared/logger.js';

const log = createChildLogger({ module: 'health' });

/**
 * Check database connectivity by executing `SELECT 1`.
 *
 * @returns latency in milliseconds, or null if unreachable
 */
async function checkDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now();
  try {
    await db.execute('SELECT 1');
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    log.warn({ err }, 'DB health check failed');
    return { ok: false, latencyMs: Math.round(performance.now() - start) };
  }
}

/**
 * Check Redis connectivity via PING.
 *
 * @returns true if Redis replies with PONG
 */
async function checkRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (err) {
    log.warn({ err }, 'Redis health check failed');
    return false;
  }
}

/**
 * Check whether an upstream HTTP service is reachable.
 *
 * Any HTTP response (including 404, 500, 302) means the server IS running
 * and reachable — only network-level failures (connection refused, DNS
 * failure, timeout) indicate the service is truly down.
 *
 * @param url - Full URL to check (e.g. "http://localhost:5001")
 * @returns 'ok' if any HTTP response received, 'error' on network failure
 */
export async function checkServiceReachable(
  url: string,
): Promise<'ok' | 'error'> {
  try {
    await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    // Any HTTP response (even 404, 500) means the server is reachable
    return 'ok';
  } catch (err) {
    log.warn({ err, url }, 'Service reachability check failed');
    return 'error';
  }
}

export function readinessStatus(
  dbOk: boolean,
  redisOk: boolean,
  mirofishStatus: 'ok' | 'error' | 'unconfigured',
): 'ok' | 'degraded' {
  return dbOk && redisOk && mirofishStatus !== 'error' ? 'ok' : 'degraded';
}

/**
 * Check MiroFish API reachability.
 *
 * @returns 'ok' | 'error' | 'unconfigured'
 */
async function checkMirofish(): Promise<'ok' | 'error' | 'unconfigured'> {
  if (!env.MIROFISH_API_URL) {
    return 'unconfigured';
  }

  return checkServiceReachable(env.MIROFISH_API_URL);
}

/**
 * Register health check routes on the Fastify instance.
 *
 * All routes are public (no auth required):
 * - GET /health       — liveness probe
 * - GET /health/db    — database connectivity + latency
 * - GET /health/ready — full readiness (DB + Redis + MiroFish)
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // ── Liveness ─────────────────────────────────────────────────────────
  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  // ── DB connectivity ──────────────────────────────────────────────────
  app.get('/health/db', async (_request, reply) => {
    const result = await checkDb();

    if (!result.ok) {
      return reply.status(503).send({
        status: 'error',
        latency_ms: result.latencyMs,
      });
    }

    return reply.send({
      status: 'ok',
      latency_ms: result.latencyMs,
    });
  });

  // ── Full readiness ───────────────────────────────────────────────────
  app.get('/health/ready', async (_request, reply) => {
    const [dbResult, redisOk, mirofishStatus] = await Promise.all([
      checkDb(),
      checkRedis(),
      checkMirofish(),
    ]);

    const services = {
      db: dbResult.ok ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      mirofish: mirofishStatus,
    };

    const status = readinessStatus(
      services.db === 'ok',
      services.redis === 'ok',
      mirofishStatus,
    );

    return reply.send({ status, services });
  });
}
