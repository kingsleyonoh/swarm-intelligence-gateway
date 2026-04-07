import { describe, it, expect, beforeEach } from 'vitest';
import { transformSimulations, transformPredictions } from '../../src/api/data-bridge-transforms.js';
import type { TheaterCardData } from '../../src/components/theater-types.js';

describe('transformSimulations — status passthrough', () => {
  beforeEach(() => {
    // Prime the prediction cache so transformSimulations has enrichment data
    transformPredictions({
      data: [
        {
          id: 'pred-1',
          simulationId: 'sim-1',
          theater: 'Test Theater',
          predictionType: 'escalation',
          summary: 'Test prediction',
          confidence: 0.85,
          timeHorizon: '72h',
          createdAt: '2026-04-07T00:00:00Z',
        },
      ],
    });
  });

  it('passes simulation status to TheaterCardData', () => {
    const result = transformSimulations({
      data: [
        {
          id: 'sim-1',
          scenarioId: 'scen-1',
          status: 'simulating',
          agentCount: 4096,
          roundCount: 5,
          createdAt: '2026-04-07T00:00:00Z',
        },
      ],
    });

    expect(result.length).toBe(1);
    expect(result[0].status).toBe('simulating');
  });

  it('passes completed status', () => {
    const result = transformSimulations({
      data: [
        {
          id: 'sim-1',
          scenarioId: 'scen-1',
          status: 'completed',
          agentCount: 4096,
          roundCount: 5,
          createdAt: '2026-04-07T00:00:00Z',
        },
      ],
    });

    expect(result[0].status).toBe('completed');
  });

  it('includes status as undefined when not present in API response', () => {
    const result = transformSimulations({
      data: [
        {
          id: 'sim-1',
          scenarioId: 'scen-1',
          agentCount: 4096,
          roundCount: 5,
          createdAt: '2026-04-07T00:00:00Z',
        },
      ],
    });

    expect(result[0].status).toBeUndefined();
  });
});
