/**
 * Prediction Parser.
 *
 * Extracts structured predictions from MiroFish simulation report text.
 *
 * Supports TWO formats:
 * 1. Structured blocks: `**Prediction N:**` with labeled fields (original)
 * 2. Narrative sections: `## Section Heading` with prose content (MiroFish actual output)
 *
 * The narrative parser infers prediction type from section keywords,
 * extracts the theater from the report title, and uses the first
 * paragraph as the prediction summary.
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

// ── Keyword → Type Mapping ────────────────────────────────────────────

const TYPE_KEYWORDS: Array<[RegExp, string]> = [
  // Order matters — more specific matches first
  [/de-escalat|diplomati|peace|negotiat|ceasefire|withdraw|restraint|realignment/i, PREDICTION_TYPE.DE_ESCALATION],
  [/market|economic|oil|price|trade|financ|commodit|volatil|invest|currency/i, PREDICTION_TYPE.MARKET_SHIFT],
  [/sentiment|public|opinion|media|narrative|perception|information|social/i, PREDICTION_TYPE.SENTIMENT_CASCADE],
  [/escalat|military|conflict|confront|war|weapon|attack|naval|crisis|trend|risk/i, PREDICTION_TYPE.ESCALATION],
];

function inferPredictionType(heading: string, content: string): string {
  const text = `${heading} ${content.slice(0, 500)}`;
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return PREDICTION_TYPE.ESCALATION; // default
}

// ── Helpers ────────────────────────────────────────────────────────────

function extractTheater(reportText: string): string {
  // Known theater names (ordered by specificity)
  const knownTheaters = [
    'Strait of Hormuz', 'Persian Gulf', 'South China Sea', 'Eastern Mediterranean',
    'Middle East', 'Eastern Europe', 'West Africa', 'Central Asia', 'North Korea',
    'Taiwan Strait', 'Black Sea', 'Baltic Sea', 'Horn of Africa', 'Sahel Region',
  ];
  for (const t of knownTheaters) {
    if (reportText.includes(t)) return t;
  }

  // Fallback: geographic region pattern
  const geoMatch = reportText.match(
    /(?:in|of|at)\s+(?:the\s+)?([\w\s]{3,30}(?:Sea|Gulf|Strait|Region|Peninsula|Theater))/i,
  );
  if (geoMatch) return geoMatch[1].trim();

  return 'Global';
}

function extractTimeHorizon(content: string): string {
  const match = content.match(/(\d+)[\s-]*(?:hour|hr)/i);
  if (match) return `${match[1]}h`;
  const dayMatch = content.match(/(\d+)[\s-]*(?:day|d\b)/i);
  if (dayMatch) return `${dayMatch[1]}d`;
  return '72h'; // default for most MiroFish scenarios
}

function extractFactions(content: string, type: 'supporting' | 'dissenting'): string[] {
  const factions: string[] = [];
  // Look for named entities in alliance/opposition patterns
  if (type === 'supporting') {
    const matches = content.matchAll(
      /(?:allied with|supports?|aligned with|backed by|in (?:favor|support))\s+(?:the\s+)?([A-Z][\w\s]{2,40}?)(?:\.|,|;|\band\b)/gi,
    );
    for (const m of matches) factions.push(m[1].trim());
  } else {
    const matches = content.matchAll(
      /(?:opposes?|against|opposing|in opposition|dissent|adversar)\s+(?:the\s+)?([A-Z][\w\s]{2,40}?)(?:\.|,|;|\band\b)/gi,
    );
    for (const m of matches) factions.push(m[1].trim());
  }
  return [...new Set(factions)].slice(0, 5);
}

function estimateConfidence(content: string): number {
  // Look for explicit confidence/probability values
  const pctMatch = content.match(/(\d{1,3})%\s*(?:confidence|probability|likelihood|chance)/i);
  if (pctMatch) return Math.min(parseFloat(pctMatch[1]) / 100, 1);

  const decMatch = content.match(/confidence[:\s]+(\d\.\d+)/i);
  if (decMatch) return Math.min(parseFloat(decMatch[1]), 1);

  // Infer from language strength
  const strongWords = /will\s|certain|inevitable|imminent|definite|assured/i;
  const moderateWords = /likely|expect|predict|anticipat|probable|forecast/i;
  const weakWords = /may|might|could|possible|potential|uncertain/i;

  const text = content.slice(0, 1000);
  if (strongWords.test(text)) return 0.85;
  if (moderateWords.test(text)) return 0.72;
  if (weakWords.test(text)) return 0.55;
  return 0.65; // moderate default
}

function extractFirstParagraph(content: string): string {
  const lines = content.split('\n').filter((l) => {
    const trimmed = l.trim();
    return trimmed.length > 20 && !trimmed.startsWith('#') && !trimmed.startsWith('>');
  });
  const first = lines[0]?.trim() ?? '';
  // Truncate to ~200 chars at sentence boundary
  if (first.length <= 200) return first;
  const sentenceEnd = first.indexOf('. ', 100);
  if (sentenceEnd > 0) return first.slice(0, sentenceEnd + 1);
  return first.slice(0, 200) + '...';
}

// ── Structured Block Parser (original) ────────────────────────────────

function extractField(block: string, label: string): string | undefined {
  const regex = new RegExp(
    `^[ \\t]*-[ \\t]*(?:\\*\\*)?${label}:(?:\\*\\*)?[ \\t]*(.*)$`,
    'im',
  );
  const match = block.match(regex);
  if (!match) return undefined;
  return (match[1] ?? '').trim();
}

function parseFactions(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((f) => f.trim()).filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parseStructuredBlocks(reportText: string): ParsedPrediction[] {
  const predictions: ParsedPrediction[] = [];
  const blocks = reportText.split(/\*\*Prediction\s+\d+[\s\S]*?\*\*/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const theater = extractField(block, 'Theater');
    const type = extractField(block, 'Type');
    const summary = extractField(block, 'Summary');
    const confidenceStr = extractField(block, 'Confidence');
    const timeHorizon = extractField(block, 'Time Horizon');

    if (!theater || !type || !summary || !confidenceStr || !timeHorizon) continue;
    const parsedConfidence = parseFloat(confidenceStr);
    if (isNaN(parsedConfidence)) continue;
    if (!VALID_PREDICTION_TYPES.has(type)) continue;

    predictions.push({
      theater,
      predictionType: type,
      summary,
      confidence: clamp(parsedConfidence, 0, 1),
      timeHorizon,
      supportingFactions: parseFactions(extractField(block, 'Supporting Factions')),
      dissentingFactions: parseFactions(extractField(block, 'Dissenting Factions')),
    });
  }
  return predictions;
}

// ── Narrative Section Parser (MiroFish actual output) ──────────────────

function parseNarrativeSections(reportText: string): ParsedPrediction[] {
  const predictions: ParsedPrediction[] = [];
  const theater = extractTheater(reportText);

  // Split by ## headings
  const sections = reportText.split(/(?=## )/);

  for (const section of sections) {
    const headingMatch = section.match(/^## (.+?)(?:\n|$)/);
    if (!headingMatch) continue;

    const heading = headingMatch[1].trim();
    const content = section.slice(headingMatch[0].length);

    if (content.trim().length < 50) continue;

    const predictionType = inferPredictionType(heading, content);
    const summary = extractFirstParagraph(content);
    const confidence = estimateConfidence(content);
    const timeHorizon = extractTimeHorizon(content);

    if (!summary) continue;

    predictions.push({
      theater,
      predictionType,
      summary,
      confidence,
      timeHorizon,
      supportingFactions: extractFactions(content, 'supporting'),
      dissentingFactions: extractFactions(content, 'dissenting'),
    });
  }

  return predictions;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Parse predictions from MiroFish simulation report text.
 *
 * Tries structured block format first (explicit `**Prediction N:**` blocks).
 * Falls back to narrative section format (`## Section Heading` with prose).
 */
export function parsePredictions(reportText: string): ParsedPrediction[] {
  if (!reportText) return [];

  // Try structured format first
  const structured = parseStructuredBlocks(reportText);
  if (structured.length > 0) {
    log.info({ count: structured.length, format: 'structured' }, 'Parsed predictions from report');
    return structured;
  }

  // Fallback to narrative sections
  const narrative = parseNarrativeSections(reportText);
  log.info({ count: narrative.length, format: 'narrative' }, 'Parsed predictions from report');
  return narrative;
}
