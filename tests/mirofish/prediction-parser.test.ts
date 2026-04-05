/**
 * Tests for the MiroFish prediction parser.
 *
 * The parser extracts structured predictions from simulation report text.
 * It must handle valid reports, missing fields, out-of-range confidence
 * values, unknown prediction types, and empty reports.
 */

import { describe, it, expect, vi } from 'vitest';

// Silence the module logger so parser.log.warn() calls don't noisy-up tests
vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

import { parsePredictions } from '../../src/mirofish/prediction-parser.js';

// ── Valid Reports ───────────────────────────────────────────────────────

describe('parsePredictions — valid reports', () => {
  it('parses a single complete prediction block', () => {
    const report = `## Swarm Report

**Prediction 1: Escalation**
- Theater: Persian Gulf
- Type: escalation
- Summary: Naval tensions will escalate within 72 hours
- Confidence: 0.85
- Time Horizon: 72h
- Supporting Factions: Iran Revolutionary Guard, Houthi Allies
- Dissenting Factions: US Navy, GCC
`;

    const preds = parsePredictions(report);
    expect(preds).toHaveLength(1);

    const [pred] = preds;
    expect(pred.theater).toBe('Persian Gulf');
    expect(pred.predictionType).toBe('escalation');
    expect(pred.summary).toBe('Naval tensions will escalate within 72 hours');
    expect(pred.confidence).toBe(0.85);
    expect(pred.timeHorizon).toBe('72h');
    expect(pred.supportingFactions).toEqual([
      'Iran Revolutionary Guard',
      'Houthi Allies',
    ]);
    expect(pred.dissentingFactions).toEqual(['US Navy', 'GCC']);
  });

  it('parses multiple prediction blocks in one report', () => {
    const report = `## Report

**Prediction 1: Escalation**
- Theater: Persian Gulf
- Type: escalation
- Summary: Naval confrontation
- Confidence: 0.85
- Time Horizon: 72h
- Supporting Factions: Iran
- Dissenting Factions: USA

**Prediction 2: Market Shift**
- Theater: Persian Gulf
- Type: market_shift
- Summary: Oil prices spike 15%
- Confidence: 0.72
- Time Horizon: 7d
- Supporting Factions: OPEC
- Dissenting Factions: IEA

**Prediction 3: Sentiment Cascade**
- Theater: Taiwan Strait
- Type: sentiment_cascade
- Summary: Nationalism surges
- Confidence: 0.6
- Time Horizon: 24h
- Supporting Factions: PLA
- Dissenting Factions: ROC
`;

    const preds = parsePredictions(report);
    expect(preds).toHaveLength(3);
    expect(preds[0].predictionType).toBe('escalation');
    expect(preds[1].predictionType).toBe('market_shift');
    expect(preds[2].predictionType).toBe('sentiment_cascade');
  });

  it('returns empty array for a report with no predictions', () => {
    const report = `## Report

No meaningful outcomes detected.
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parsePredictions('')).toEqual([]);
  });

  it('handles empty supporting/dissenting faction lists', () => {
    const report = `**Prediction 1: De-escalation**
- Theater: Red Sea
- Type: de_escalation
- Summary: Tensions cool
- Confidence: 0.5
- Time Horizon: 7d
- Supporting Factions:
- Dissenting Factions:
`;
    const preds = parsePredictions(report);
    expect(preds).toHaveLength(1);
    expect(preds[0].supportingFactions).toEqual([]);
    expect(preds[0].dissentingFactions).toEqual([]);
  });
});

// ── Missing Fields ──────────────────────────────────────────────────────

describe('parsePredictions — missing fields', () => {
  it('skips a prediction block missing theater', () => {
    const report = `**Prediction 1: Broken**
- Type: escalation
- Summary: No theater declared
- Confidence: 0.8
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('skips a prediction block missing type', () => {
    const report = `**Prediction 1: Broken**
- Theater: Persian Gulf
- Summary: No type declared
- Confidence: 0.8
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('skips a prediction block missing summary', () => {
    const report = `**Prediction 1: Broken**
- Theater: Persian Gulf
- Type: escalation
- Confidence: 0.8
- Time Horizon: 24h
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('skips a prediction block missing confidence', () => {
    const report = `**Prediction 1: Broken**
- Theater: Persian Gulf
- Type: escalation
- Summary: No confidence
- Time Horizon: 24h
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('skips a prediction block missing time horizon', () => {
    const report = `**Prediction 1: Broken**
- Theater: Persian Gulf
- Type: escalation
- Summary: No horizon
- Confidence: 0.8
`;
    const preds = parsePredictions(report);
    expect(preds).toEqual([]);
  });

  it('keeps valid predictions and skips only invalid ones in mixed reports', () => {
    const report = `**Prediction 1: Good**
- Theater: Persian Gulf
- Type: escalation
- Summary: Valid
- Confidence: 0.8
- Time Horizon: 24h
- Supporting Factions: A
- Dissenting Factions: B

**Prediction 2: Broken**
- Type: escalation
- Summary: Missing theater
- Confidence: 0.8
- Time Horizon: 24h

**Prediction 3: Good**
- Theater: Taiwan Strait
- Type: market_shift
- Summary: Also valid
- Confidence: 0.7
- Time Horizon: 7d
- Supporting Factions: X
- Dissenting Factions: Y
`;
    const preds = parsePredictions(report);
    expect(preds).toHaveLength(2);
    expect(preds[0].theater).toBe('Persian Gulf');
    expect(preds[1].theater).toBe('Taiwan Strait');
  });
});
