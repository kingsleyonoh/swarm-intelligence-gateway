/**
 * Tests for the MiroFish prediction parser's validation layer:
 * confidence clamping, non-numeric rejection, and unknown-type handling.
 *
 * Structural happy-path + missing-field tests live in
 * `prediction-parser.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

import { parsePredictions } from '../../src/mirofish/prediction-parser.js';

// ── Confidence Clamping ─────────────────────────────────────────────────

describe('parsePredictions — confidence bounds', () => {
  it('clamps confidence > 1.0 to 1.0', () => {
    const report = `**Prediction 1: Clamp**
- Theater: Persian Gulf
- Type: escalation
- Summary: Over-confident
- Confidence: 1.5
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B
`;
    const preds = parsePredictions(report);
    expect(preds).toHaveLength(1);
    expect(preds[0].confidence).toBe(1.0);
  });

  it('clamps confidence < 0.0 to 0.0', () => {
    const report = `**Prediction 1: Clamp**
- Theater: Persian Gulf
- Type: escalation
- Summary: Negative confidence
- Confidence: -0.5
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B
`;
    const preds = parsePredictions(report);
    expect(preds).toHaveLength(1);
    expect(preds[0].confidence).toBe(0.0);
  });

  it('skips prediction when confidence is not a number', () => {
    const report = `**Prediction 1: Bad**
- Theater: Persian Gulf
- Type: escalation
- Summary: Not a number
- Confidence: high
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('accepts edge values 0 and 1', () => {
    const report = `**Prediction 1: Zero**
- Theater: Persian Gulf
- Type: escalation
- Summary: Min
- Confidence: 0
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B

**Prediction 2: One**
- Theater: Persian Gulf
- Type: escalation
- Summary: Max
- Confidence: 1
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B
`;
    const preds = parsePredictions(report);
    expect(preds).toHaveLength(2);
    expect(preds[0].confidence).toBe(0);
    expect(preds[1].confidence).toBe(1);
  });
});

// ── Unknown prediction types ───────────────────────────────────────────

describe('parsePredictions — unknown types', () => {
  it('skips predictions with unrecognised type', () => {
    const report = `**Prediction 1: Alien**
- Theater: Persian Gulf
- Type: cosmic_event
- Summary: Not a known type
- Confidence: 0.8
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('accepts all four canonical prediction types', () => {
    const report = `**Prediction 1**
- Theater: A
- Type: escalation
- Summary: s
- Confidence: 0.5
- Time Horizon: 24h
- Supporting Factions:
- Dissenting Factions:

**Prediction 2**
- Theater: B
- Type: de_escalation
- Summary: s
- Confidence: 0.5
- Time Horizon: 24h
- Supporting Factions:
- Dissenting Factions:

**Prediction 3**
- Theater: C
- Type: market_shift
- Summary: s
- Confidence: 0.5
- Time Horizon: 24h
- Supporting Factions:
- Dissenting Factions:

**Prediction 4**
- Theater: D
- Type: sentiment_cascade
- Summary: s
- Confidence: 0.5
- Time Horizon: 24h
- Supporting Factions:
- Dissenting Factions:
`;
    const preds = parsePredictions(report);
    expect(preds).toHaveLength(4);
    const types = preds.map((p) => p.predictionType);
    expect(types).toEqual([
      'escalation',
      'de_escalation',
      'market_shift',
      'sentiment_cascade',
    ]);
  });
});
