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

describe('transformPredictions — upstream language passthrough', () => {
  it('keeps predictions when the upstream report contains non-English text', () => {
    const result = transformPredictions({
      data: [
        {
          id: 'pred-cjk',
          simulationId: 'sim-live',
          theater: 'Strait of Hormuz',
          predictionType: 'market_shift',
          summary: '市场溢出风险在未来72小时内上升。',
          confidence: '0.65',
          timeHorizon: '72h',
          createdAt: '2026-08-28T15:23:14Z',
        },
      ],
    });

    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].summary).toContain('市场溢出风险');
  });
});
