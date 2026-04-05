/**
 * Prediction Parser.
 *
 * Extracts structured predictions from MiroFish simulation report text.
 * Uses pattern matching to find prediction blocks with theater, type,
 * summary, confidence, time horizon, and faction data.
 *
 * Policy:
 * - Missing required fields → block is skipped and logged
 * - Confidence out of [0, 1] → clamped to the range
 * - Non-numeric confidence → block is skipped and logged
 * - Unknown prediction_type (not one of the canonical four) → skipped
 */

import { PREDICTION_TYPE } from '../config/constants.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger({ module: 'prediction-parser' });

// ── Types ──────────────────────────────────────────────────────────────

export interface ParsedPrediction {
  theater: string;
  predictionType: string;
  summary: string;
  confidence: number;
  timeHorizon: string;
  supportingFactions: string[];
  dissentingFactions: string[];
}

/** Set of canonical prediction types accepted by the parser. */
const VALID_PREDICTION_TYPES: ReadonlySet<string> = new Set<string>(
  Object.values(PREDICTION_TYPE),
);

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Extract a field value from a line matching `- Label: value` or
 * `- **Label:** value`. Returns the trimmed value, or undefined if the
 * line is absent. Lines that declare the label with an empty value
 * (e.g. `- Supporting Factions:`) return an empty string.
 */
function extractField(block: string, label: string): string | undefined {
  // Anchor on line starts and only consume within the current line
  // so an empty value (e.g. `- Supporting Factions:`) does not hop onto
  // the following line.
  const regex = new RegExp(
    `^[ \\t]*-[ \\t]*(?:\\*\\*)?${label}:(?:\\*\\*)?[ \\t]*(.*)$`,
    'im',
  );
  const match = block.match(regex);
  if (!match) return undefined;
  return (match[1] ?? '').trim();
}

/** Parse comma-separated faction names from a field value. */
function parseFactions(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Clamp a number into the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ── Parser ─────────────────────────────────────────────────────────────

/**
 * Parse predictions from MiroFish simulation report text.
 *
 * Expected format in report:
 * ```
 * **Prediction N: <Title>**
 * - Theater: <theater>
 * - Type: <prediction_type>
 * - Summary: <text>
 * - Confidence: <0.0-1.0>
 * - Time Horizon: <duration>
 * - Supporting Factions: <comma-separated>
 * - Dissenting Factions: <comma-separated>
 * ```
 */
export function parsePredictions(reportText: string): ParsedPrediction[] {
  if (!reportText) return [];

  const predictions: ParsedPrediction[] = [];

  // Split on prediction block headers. Using [\s\S] to tolerate any
  // title text (or none) between "Prediction N" and the closing `**`.
  const blocks = reportText.split(/\*\*Prediction\s+\d+[\s\S]*?\*\*/);

  // First element is text before the first prediction — skip it
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const theater = extractField(block, 'Theater');
    const type = extractField(block, 'Type');
    const summary = extractField(block, 'Summary');
    const confidenceStr = extractField(block, 'Confidence');
    const timeHorizon = extractField(block, 'Time Horizon');
    const supportingStr = extractField(block, 'Supporting Factions');
    const dissentingStr = extractField(block, 'Dissenting Factions');

    if (!theater || !type || !summary || !confidenceStr || !timeHorizon) {
      log.warn({ blockIndex: i }, 'Skipping prediction block: missing required field');
      continue;
    }

    const parsedConfidence = parseFloat(confidenceStr);
    if (isNaN(parsedConfidence)) {
      log.warn({ blockIndex: i, confidenceStr }, 'Skipping prediction block: non-numeric confidence');
      continue;
    }
    const confidence = clamp(parsedConfidence, 0, 1);

    if (!VALID_PREDICTION_TYPES.has(type)) {
      log.warn({ blockIndex: i, type }, 'Skipping prediction block: unknown prediction type');
      continue;
    }

    predictions.push({
      theater,
      predictionType: type,
      summary,
      confidence,
      timeHorizon,
      supportingFactions: parseFactions(supportingStr),
      dissentingFactions: parseFactions(dissentingStr),
    });
  }

  log.info({ count: predictions.length }, 'Parsed predictions from report');
  return predictions;
}
