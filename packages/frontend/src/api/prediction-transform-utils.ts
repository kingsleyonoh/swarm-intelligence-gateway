import type { FactionStance } from '../components/faction-types.js';

export function parseFactions(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

export function supportingStance(predictionType: string): FactionStance {
  if (predictionType === 'escalation') return 'escalate';
  if (predictionType === 'de_escalation') return 'de_escalate';
  return 'uncertain';
}

export function dissentingStance(predictionType: string): FactionStance {
  if (predictionType === 'escalation') return 'de_escalate';
  if (predictionType === 'de_escalation') return 'escalate';
  return 'uncertain';
}

export function formatPredictionType(type: string): string {
  if (!type) return 'Unknown';
  return type.replace(/_/g, '-').replace(/\b\w/g, (character) => character.toUpperCase());
}
