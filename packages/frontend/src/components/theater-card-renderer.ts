import type { TheaterCardData } from './theater-types.js';
import {
  createFactionSplitBar,
  createSimulationPulse,
} from './theater-helpers.js';

const ACTIVE_SIM_STATUSES = new Set([
  'pending', 'queued', 'graph_building', 'simulating', 'reporting',
]);

export function buildTheaterCard(
  data: TheaterCardData,
  onExpand: () => void,
): HTMLElement {
  if (ACTIVE_SIM_STATUSES.has(data.status ?? '')) {
    const hidden = document.createElement('div');
    hidden.style.display = 'none';
    return hidden;
  }

  const card = document.createElement('div');
  card.className = 'theater-card';
  card.dataset.domain = data.domain;
  card.dataset.cardId = data.id;

  const pulse = createSimulationPulse(data.status);
  if (pulse) {
    card.classList.add('theater-card--simulating');
    card.appendChild(pulse);
  }

  const header = document.createElement('div');
  header.className = 'prediction-header';
  const typeBadge = document.createElement('span');
  typeBadge.className = `prediction-type-badge prediction-type--${(data.predictionType || 'unknown').toLowerCase().replace(/\s+/g, '-')}`;
  typeBadge.textContent = data.predictionType || 'Analysis';
  header.appendChild(typeBadge);

  const confidence = document.createElement('span');
  confidence.className = 'prediction-confidence';
  confidence.textContent = `${Math.round(data.confidence * 100)}%`;
  header.appendChild(confidence);
  if (data.timeHorizon) {
    const horizon = document.createElement('span');
    horizon.className = 'prediction-horizon';
    horizon.textContent = data.timeHorizon;
    header.appendChild(horizon);
  }

  const ageMs = data.predictedAt ? Date.now() - new Date(data.predictedAt).getTime() : Infinity;
  if (ageMs < 3600000) {
    const badge = document.createElement('span');
    badge.className = 'prediction-new-badge';
    badge.textContent = 'NEW';
    header.appendChild(badge);
    card.classList.add('theater-card--new');
  }
  card.appendChild(header);

  const name = document.createElement('h3');
  name.textContent = data.theater;
  card.appendChild(name);
  const summary = document.createElement('p');
  summary.className = 'top-prediction';
  summary.textContent = data.topPrediction;
  card.appendChild(summary);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const agents = document.createElement('span');
  agents.className = 'agent-count-badge';
  agents.textContent = `${data.agentCount.toLocaleString()} agents`;
  meta.appendChild(agents);
  const freshness = document.createElement('span');
  freshness.className = 'prediction-freshness';
  freshness.textContent = formatFreshness(data.predictedAt);
  meta.appendChild(freshness);
  if (data.signalCount && data.signalCount > 0) {
    const signals = document.createElement('span');
    signals.className = 'signal-attribution';
    signals.textContent = `Based on ${data.signalCount} intelligence signals`;
    meta.appendChild(signals);
  }
  card.appendChild(meta);
  card.appendChild(createFactionSplitBar(data.factionSplit));
  card.addEventListener('click', onExpand);
  return card;
}

function formatFreshness(dateStr: string): string {
  if (!dateStr) return '';
  const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
