import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ActionLogEntry, MirofishAgentProfile } from '../../src/mirofish/types.js';

/**
 * Mock undici request function for MiroFish client data-fetching methods.
 *
 * MiroFish is an EXTERNAL self-hosted service — mocking HTTP is correct
 * per coding standards.
 */
const mocks = vi.hoisted(() => {
  const request = vi.fn();
  return { request };
});

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return {
    ...actual,
    request: mocks.request,
  };
});

// Mock logger to prevent output during tests
vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Import after mocks are set up
const { MirofishClient } = await import('../../src/mirofish/client.js');

// ── Helpers ───────────────────────────────────────────────────────────

/** Create a mock undici response with a JSON body. */
function mockResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    body: {
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    },
  };
}

describe('MirofishClient data-fetching', () => {
  let client: InstanceType<typeof MirofishClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MirofishClient('http://localhost:5000', {
      maxRetries: 3,
      retryBaseDelayMs: 1,
      ontologyPollIntervalMs: 1,
      simulationPollIntervalMs: 1,
    });
  });

  // ── fetchActionLog ──────────────────────────────────────────────────

  describe('fetchActionLog', () => {
    it('should return parsed actions when API returns data', async () => {
      const actions: ActionLogEntry[] = [
        {
          agent_id: 1,
          round: 1,
          platform: 'twitter',
          action_type: 'CREATE_POST',
          content: 'Oil prices rising fast',
          timestamp: '2026-04-04T12:00:00Z',
          metadata: { likes: 0 },
        },
        {
          agent_id: 2,
          round: 1,
          platform: 'twitter',
          action_type: 'LIKE_POST',
          content: '',
          timestamp: '2026-04-04T12:01:00Z',
          metadata: {},
        },
      ];

      mocks.request.mockResolvedValue(
        mockResponse(200, { data: { actions, count: 2 } }),
      );

      const result = await client.fetchActionLog('sim_abc123');

      expect(result).toEqual(actions);
      expect(result).toHaveLength(2);
      expect(mocks.request).toHaveBeenCalledTimes(1);
      const callArgs = mocks.request.mock.calls[0];
      expect(callArgs[0]).toBe(
        'http://localhost:5000/api/simulation/sim_abc123/actions',
      );
    });

    it('should return empty array when API returns empty actions', async () => {
      mocks.request.mockResolvedValue(
        mockResponse(200, { data: { actions: [], count: 0 } }),
      );

      const result = await client.fetchActionLog('sim_abc123');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when API returns no actions field', async () => {
      mocks.request.mockResolvedValue(
        mockResponse(200, { data: {} }),
      );

      const result = await client.fetchActionLog('sim_abc123');

      expect(result).toEqual([]);
    });
  });

  // ── fetchProfiles ───────────────────────────────────────────────────

  describe('fetchProfiles', () => {
    it('should return profiles when API returns data', async () => {
      const profiles: MirofishAgentProfile[] = [
        {
          user_id: 1,
          username: 'analyst_mike',
          name: 'Mike Johnson',
          bio: 'Oil market analyst',
          persona: 'Cautious market observer',
          profession: 'Financial Analyst',
          country: 'US',
        },
        {
          user_id: 2,
          username: 'reporter_sara',
          name: 'Sara Ahmed',
          bio: 'Gulf correspondent',
          persona: 'Investigative journalist',
          profession: 'Journalist',
          country: 'UAE',
        },
      ];

      mocks.request.mockResolvedValue(
        mockResponse(200, { data: { profiles } }),
      );

      const result = await client.fetchProfiles('sim_abc123');

      expect(result).toEqual(profiles);
      expect(result).toHaveLength(2);
      expect(mocks.request).toHaveBeenCalledTimes(1);
      const callArgs = mocks.request.mock.calls[0];
      expect(callArgs[0]).toBe(
        'http://localhost:5000/api/simulation/sim_abc123/profiles',
      );
    });

    it('should return empty array when API returns empty profiles', async () => {
      mocks.request.mockResolvedValue(
        mockResponse(200, { data: { profiles: [] } }),
      );

      const result = await client.fetchProfiles('sim_abc123');

      expect(result).toEqual([]);
    });

    it('should return empty array gracefully when API endpoint fails', async () => {
      mocks.request.mockResolvedValue(
        mockResponse(404, { error: 'Not found' }),
      );

      const result = await client.fetchProfiles('sim_abc123');

      expect(result).toEqual([]);
    });

    it('should return empty array when API has no profiles field', async () => {
      mocks.request.mockResolvedValue(
        mockResponse(200, { data: {} }),
      );

      const result = await client.fetchProfiles('sim_abc123');

      expect(result).toEqual([]);
    });
  });
});
