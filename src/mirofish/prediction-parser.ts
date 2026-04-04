/**
 * Prediction Parser.
 *
 * Extracts structured predictions from MiroFish simulation report text.
 * Uses pattern matching to find prediction blocks with theater, type,
 * summary, confidence, time horizon, and faction data.
 */

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

// ── Parser ─────────────────────────────────────────────────────────────

/**
 * Extract a field value from a line matching `- **Label:** value`.
 */
function extractField(block: string, label: string): string | undefined {
  const regex = new RegExp(`-\\s*\\*\\*${label}:\\*\\*\\s*(.+)`, 'i');
  const match = block.match(regex);
  return match?.[1]?.trim();
}

/**
 * Parse comma-separated faction names from a field value.
 */
function parseFactions(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

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
  const predictions: ParsedPrediction[] = [];

  // Split on prediction block headers
  const blocks = reportText.split(/\*\*Prediction\s+\d+[^*]*\*\*/);

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
      log.warn({ blockIndex: i }, 'Skipping incomplete prediction block');
      continue;
    }

    const confidence = parseFloat(confidenceStr);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      log.warn({ blockIndex: i, confidenceStr }, 'Invalid confidence value');
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
