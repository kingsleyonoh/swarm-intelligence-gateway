/**
 * Live Feed — scrolling agent action feed with polling and completion detection.
 *
 * Polls GET /api/simulations/:id/actions every 5s, renders agent actions
 * with stance colors, and detects simulation completion via the progress
 * endpoint.
 */

import { createReportView } from './report-view.js';

export interface LiveFeedAction {
  id: string;
  agentId: number;
  username: string;
  stance: string;
  roundNumber: number;
  actionType: string;
  content: string;
  createdAt: string;
}

const STANCE_COLORS: Record<string, string> = {
  escalate: '#e05252',
  de_escalate: '#4a90d9',
  uncertain: '#d4a843',
  neutral: '#888',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildActionEl(action: LiveFeedAction): HTMLElement {
  const el = document.createElement('div');
  el.className = 'live-action';

  const dot = document.createElement('div');
  dot.className = 'live-action-dot';
  dot.style.background = STANCE_COLORS[action.stance] ?? STANCE_COLORS.neutral;
  el.appendChild(dot);

  const body = document.createElement('div');
  body.className = 'live-action-body';

  const meta = document.createElement('div');
  meta.className = 'live-action-meta';
  meta.innerHTML = `<span class="live-action-username">${esc(action.username)}</span>`
    + `<span class="live-action-type">${esc(action.actionType)}</span>`
    + `<span class="live-action-round">R${action.roundNumber}</span>`;
  body.appendChild(meta);

  const content = document.createElement('p');
  content.className = 'live-action-content';
  content.textContent = action.content;
  body.appendChild(content);

  el.appendChild(body);
  return el;
}

async function fetchActions(
  simId: string,
  apiKey: string,
  baseUrl: string,
  limit = 30,
): Promise<{ data: LiveFeedAction[]; hasMore: boolean }> {
  const base = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/simulations/${simId}/actions?limit=${limit}`, {
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return { data: [], hasMore: false };
  return res.json() as Promise<{ data: LiveFeedAction[]; hasMore: boolean }>;
}

async function fetchProgress(
  simId: string,
  apiKey: string,
  baseUrl: string,
): Promise<{ isActive: boolean }> {
  const base = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/simulations/${simId}/progress`, {
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return { isActive: true };
  const body = await res.json() as { isActive: boolean };
  return { isActive: body.isActive };
}

function showCompletionBanner(
  feed: HTMLElement,
  listEl: HTMLElement,
  actionCount: number,
  simId: string,
  theaterName: string,
  apiKey: string,
  baseUrl: string,
  onBack: () => void,
): void {
  const indicator = feed.querySelector('.live-indicator');
  if (indicator) indicator.remove();

  const banner = document.createElement('div');
  banner.className = 'live-feed-complete';
  banner.innerHTML = `<h3>Simulation Complete</h3>`
    + `<p>${actionCount} actions analyzed</p>`;

  const btn = document.createElement('button');
  btn.className = 'view-report-btn';
  btn.textContent = 'View Intelligence Brief';
  btn.addEventListener('click', () => {
    const parent = feed.parentElement;
    if (!parent) return;
    feed.remove();
    const view = createReportView(simId, theaterName, apiKey, baseUrl, onBack);
    parent.appendChild(view);
  });
  banner.appendChild(btn);
  listEl.appendChild(banner);
}

export function createLiveFeed(
  simId: string,
  theaterName: string,
  apiKey: string,
  baseUrl: string,
  onBack: () => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'live-feed';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let seenIds = new Set<string>();

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'debate-back-btn';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    if (pollTimer) clearInterval(pollTimer);
    onBack();
  });
  container.appendChild(backBtn);

  // Header
  const header = document.createElement('div');
  header.className = 'live-feed-header';

  const title = document.createElement('h2');
  title.className = 'live-feed-title';
  title.textContent = theaterName;
  header.appendChild(title);

  const indicator = document.createElement('span');
  indicator.className = 'live-indicator';
  indicator.innerHTML = '<span class="live-indicator-dot"></span>Live';
  header.appendChild(indicator);

  container.appendChild(header);

  // Feed list
  const listEl = document.createElement('div');
  listEl.className = 'live-feed-list';
  container.appendChild(listEl);

  // Render actions into list
  function renderActions(actions: LiveFeedAction[]): void {
    // Reverse so newest appear at bottom (natural chat order)
    const newActions = actions
      .filter((a) => !seenIds.has(a.id))
      .reverse();

    for (const action of newActions) {
      seenIds.add(action.id);
      listEl.appendChild(buildActionEl(action));
    }

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  // Initial fetch
  fetchActions(simId, apiKey, baseUrl)
    .then((result) => renderActions(result.data))
    .catch((error) => console.warn('[swarm] Initial live feed load failed:', error));

  // Poll every 5 seconds
  pollTimer = setInterval(() => {
    Promise.all([
      fetchActions(simId, apiKey, baseUrl),
      fetchProgress(simId, apiKey, baseUrl),
    ])
      .then(([actionsResult, progressResult]) => {
        renderActions(actionsResult.data);
        if (!progressResult.isActive) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          showCompletionBanner(
            container, listEl, seenIds.size,
            simId, theaterName, apiKey, baseUrl, onBack,
          );
        }
      })
      .catch((error) => console.warn('[swarm] Live feed poll failed; retrying:', error));
  }, 5000);

  return container;
}
