/**
 * WorldMonitor Intelligence Reader.
 *
 * Connects to WorldMonitor's Redis, reads live story tracks and
 * forecast predictions, then disconnects. Returns a typed payload
 * for the public /api/intelligence endpoint.
 *
 * Connection pattern mirrors poller.ts — create, read, disconnect.
 */

import { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { createChildLogger } from '../shared/logger.js';

import type {
  IntelligencePayload,
  StoryTrack,
  ForecastPrediction,
} from './intelligence-types.js';

const log = createChildLogger({ module: 'intelligence-reader' });

const STORY_KEY_PATTERN = 'story:track:v1:*';
const FORECAST_HISTORY_KEY = 'forecast:predictions:history:v1';
const MAX_STORIES = 50;

/**
 * Read live intelligence data from WorldMonitor Redis.
 *
 * Creates a short-lived ioredis connection, reads story tracks
 * and the latest forecast predictions, then disconnects.
 *
 * On failure (Redis unreachable, bad data), returns empty arrays
 * with a current timestamp — never throws.
 */
export async function readIntelligence(): Promise<IntelligencePayload> {
  let wmRedis: Redis | undefined;

  try {
    wmRedis = new Redis(env.WORLDMONITOR_REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
      connectTimeout: 5000,
    });

    await wmRedis.connect();

    const [stories, forecasts] = await Promise.all([
      readStories(wmRedis),
      readForecasts(wmRedis),
    ]);

    return {
      stories,
      forecasts,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    log.warn(
      { error: (err as Error).message },
      'WorldMonitor intelligence read failed — returning empty payload',
    );
    return { stories: [], forecasts: [], fetchedAt: new Date().toISOString() };
  } finally {
    if (wmRedis) {
      try {
        await wmRedis.quit();
      } catch {
        // Ignore quit errors — connection may already be closed
      }
    }
  }
}

/**
 * Read story tracks from Redis hash keys matching the pattern.
 * Returns top MAX_STORIES sorted by currentScore descending.
 */
async function readStories(redis: Redis): Promise<StoryTrack[]> {
  const keys = await redis.keys(STORY_KEY_PATTERN);

  if (keys.length === 0) return [];

  const hashes = await Promise.all(
    keys.map((key) => redis.hgetall(key)),
  );

  const stories: StoryTrack[] = hashes
    .filter((h) => h && h.title)
    .map((h) => ({
      title: h.title,
      link: h.link ?? '',
      currentScore: Number(h.currentScore) || 0,
      severity: h.severity ?? 'info',
      lastSeen: Number(h.lastSeen) || 0,
    }));

  stories.sort((a, b) => b.currentScore - a.currentScore);

  return stories.slice(0, MAX_STORIES);
}

/**
 * Read the latest forecast predictions from the history list.
 * Maps each prediction's signals array to a signalCount number.
 */
async function readForecasts(redis: Redis): Promise<ForecastPrediction[]> {
  const entries = await redis.lrange(FORECAST_HISTORY_KEY, 0, 0);

  if (entries.length === 0) return [];

  try {
    const parsed = JSON.parse(entries[0]) as {
      predictions?: Array<{
        id: string;
        domain: string;
        region: string;
        title: string;
        probability: number;
        confidence: number;
        timeHorizon: string;
        signals?: unknown[];
      }>;
    };

    if (!parsed.predictions || !Array.isArray(parsed.predictions)) return [];

    return parsed.predictions.map((p) => ({
      id: p.id,
      domain: p.domain,
      region: p.region,
      title: p.title,
      probability: p.probability,
      confidence: p.confidence,
      timeHorizon: p.timeHorizon,
      signalCount: Array.isArray(p.signals) ? p.signals.length : 0,
    }));
  } catch {
    log.warn('Failed to parse forecast history entry');
    return [];
  }
}
