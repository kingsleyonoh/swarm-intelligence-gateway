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
    await db.execute('SELECT 1' as any);
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
 * Check MiroFish API reachability.
 *
 * @returns 'ok' | 'error' | 'unconfigured'
 */
async function checkMirofish(): Promise<'ok' | 'error' | 'unconfigured'> {
  if (!env.MIROFISH_API_URL) {
    return 'unconfigured';
  }

  try {
    const response = await fetch(env.MIROFISH_API_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? 'ok' : 'error';
  } catch (err) {
    log.warn({ err }, 'MiroFish health check failed');
    return 'error';
  }
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

    // Degraded if any core service (db, redis) is down
    // MiroFish "unconfigured" does not cause degraded status
    const coreHealthy = services.db === 'ok' && services.redis === 'ok';
    const status = coreHealthy ? 'ok' : 'degraded';

    return reply.send({ status, services });
  });
}
