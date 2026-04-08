/**
 * Intelligence API route — public endpoint.
 *
 * Serves WorldMonitor live data (story headlines, forecast predictions)
 * with a 5-minute Redis cache. No authentication required — this is
 * a public showcase endpoint for the portfolio demo.
 */

import type { FastifyInstance } from 'fastify';

import { getOrSet } from '../../shared/cache.js';
import { readIntelligence } from '../../worldmonitor/intelligence-reader.js';

const CACHE_KEY = 'intelligence:latest';
const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Register the intelligence route on the Fastify instance.
 *
 * GET /api/intelligence — returns live story tracks and forecast
 * predictions from WorldMonitor Redis, cached for 5 minutes.
 */
export async function intelligenceRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/api/intelligence', async (_request, reply) => {
    const data = await getOrSet(
      CACHE_KEY,
      CACHE_TTL_SECONDS,
      readIntelligence,
    );
    return reply.send(data);
  });
}
