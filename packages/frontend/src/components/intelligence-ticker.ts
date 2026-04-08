/**
 * IntelligenceTicker — Bloomberg/CNN-style scrolling news ticker.
 *
 * Displays live intelligence stories with severity indicators.
 * Items are duplicated for seamless CSS scroll animation.
 * Pauses on hover, shows placeholder when no stories available.
 */

import type { IntelligenceData, IntelStory } from './intelligence-types.js';

export interface IntelTickerController {
  update(data: IntelligenceData): void;
  destroy(): void;
}

/** Map severity to CSS modifier class */
function severityClass(severity: string): string {
  if (severity === 'critical') return 'intel-ticker-dot--critical';
  if (severity === 'warning') return 'intel-ticker-dot--warning';
  return 'intel-ticker-dot--info';
}

/** Build a single ticker item span */
function buildItem(story: IntelStory): HTMLSpanElement {
  const item = document.createElement('span');
  item.className = 'intel-ticker-item';

  const dot = document.createElement('span');
  dot.className = `intel-ticker-dot ${severityClass(story.severity)}`;
  item.appendChild(dot);

  item.appendChild(document.createTextNode(story.title));
  return item;
}

/** Calculate animation duration based on item count */
function calcDuration(itemCount: number): number {
  return 30 + itemCount * 0.5;
}

export function createIntelTicker(container: HTMLElement): IntelTickerController {
  // Build static DOM structure
  const root = document.createElement('div');
  root.className = 'intel-ticker';

  const label = document.createElement('div');
  label.className = 'intel-ticker-label';
  label.textContent = 'LIVE INTELLIGENCE';
  root.appendChild(label);

  const track = document.createElement('div');
  track.className = 'intel-ticker-track';

  const scroll = document.createElement('div');
  scroll.className = 'intel-ticker-scroll';
  track.appendChild(scroll);
  root.appendChild(track);

  container.appendChild(root);

  function update(data: IntelligenceData): void {
    scroll.innerHTML = '';

    if (!data.stories || data.stories.length === 0) {
      const placeholder = document.createElement('span');
      placeholder.className = 'intel-ticker-placeholder';
      placeholder.textContent = 'Monitoring intelligence feeds...';
      scroll.appendChild(placeholder);
      scroll.style.animation = 'none';
      return;
    }

    // Build items twice for seamless loop
    for (let pass = 0; pass < 2; pass++) {
      for (const story of data.stories) {
        scroll.appendChild(buildItem(story));
      }
    }

    const duration = calcDuration(data.stories.length);
    scroll.style.animation = `ticker-scroll ${duration}s linear infinite`;
  }

  function destroy(): void {
    root.remove();
  }

  return { update, destroy };
}
