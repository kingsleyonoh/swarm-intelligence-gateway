/**
 * Helper functions for SwarmTheaterPanel rendering.
 * Extracted to keep the main panel under 300 lines.
 */

import type {
  FactionSplitSegment,
  AgentDebatePost,
} from './theater-types.js';

const STANCE_COLORS: Record<string, string> = {
  escalate: '#e05252',
  de_escalate: '#4a90d9',
  uncertain: '#d4a843',
  neutral: '#888',
};

/** Create a circular SVG confidence gauge (arc-based) */
export function createConfidenceGauge(confidence: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'confidence-gauge';

  const size = 48;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashArray = confidence * circumference;
  const dashOffset = circumference - dashArray;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  // Background circle
  const bgCircle = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'circle',
  );
  bgCircle.setAttribute('cx', String(size / 2));
  bgCircle.setAttribute('cy', String(size / 2));
  bgCircle.setAttribute('r', String(radius));
  bgCircle.setAttribute('fill', 'none');
  bgCircle.setAttribute('stroke', '#333');
  bgCircle.setAttribute('stroke-width', String(strokeWidth));
  svg.appendChild(bgCircle);

  // Arc circle
  const arcCircle = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'circle',
  );
  arcCircle.setAttribute('class', 'gauge-arc');
  arcCircle.setAttribute('cx', String(size / 2));
  arcCircle.setAttribute('cy', String(size / 2));
  arcCircle.setAttribute('r', String(radius));
  arcCircle.setAttribute('fill', 'none');
  arcCircle.setAttribute('stroke', '#4a90d9');
  arcCircle.setAttribute('stroke-width', String(strokeWidth));
  arcCircle.setAttribute('stroke-dasharray', String(circumference));
  arcCircle.setAttribute('stroke-dashoffset', String(dashOffset));
  arcCircle.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  svg.appendChild(arcCircle);

  // Center text
  const text = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'text',
  );
  text.setAttribute('x', String(size / 2));
  text.setAttribute('y', String(size / 2 + 4));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#fff');
  text.setAttribute('font-size', '11');
  text.textContent = `${Math.round(confidence * 100)}%`;
  svg.appendChild(text);

  wrapper.appendChild(svg);
  return wrapper;
}

/** Create a horizontal faction split bar */
export function createFactionSplitBar(
  segments: FactionSplitSegment[],
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'faction-split-bar';

  for (const seg of segments) {
    const span = document.createElement('span');
    span.className = 'faction-segment';
    span.style.flexBasis = `${seg.percentage}%`;
    span.style.backgroundColor = STANCE_COLORS[seg.stance] ?? '#888';
    span.title = `${seg.label}: ${seg.percentage}%`;
    bar.appendChild(span);
  }

  return bar;
}

/** Create a single debate post element */
export function createDebatePostEl(post: AgentDebatePost): HTMLElement {
  const el = document.createElement('div');
  el.className = 'debate-post';

  const header = document.createElement('div');
  header.className = 'debate-post-header';

  const dot = document.createElement('span');
  dot.className = 'faction-dot';
  dot.style.backgroundColor = post.stanceColor;
  header.appendChild(dot);

  const name = document.createElement('span');
  name.className = 'debate-username';
  name.textContent = post.username;
  header.appendChild(name);

  const time = document.createElement('span');
  time.className = 'debate-timestamp';
  time.textContent = post.timestamp;
  header.appendChild(time);

  el.appendChild(header);

  const content = document.createElement('p');
  content.className = 'debate-content';
  content.textContent = post.content;
  el.appendChild(content);

  return el;
}

/** Create the debate feed view with virtual scroll (max 50 visible) */
export function createDebateFeed(
  posts: AgentDebatePost[],
  onBack: () => void,
): HTMLElement {
  const feed = document.createElement('div');
  feed.className = 'debate-feed';

  const backBtn = document.createElement('button');
  backBtn.className = 'debate-back-btn';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', onBack);
  feed.appendChild(backBtn);

  const list = document.createElement('div');
  list.className = 'debate-list';

  // Virtual scroll: only render up to 50 posts
  const maxVisible = 50;
  const visiblePosts = posts.slice(0, maxVisible);
  for (const post of visiblePosts) {
    list.appendChild(createDebatePostEl(post));
  }

  feed.appendChild(list);
  return feed;
}
