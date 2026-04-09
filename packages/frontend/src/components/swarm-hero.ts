/**
 * SwarmHero — persistent swarm visualization between globe and theater cards.
 *
 * Two modes:
 *  1. LIVE: When a real simulation is running, shows real phase + elapsed time
 *  2. DEMO: When idle, loops through phases as a showcase
 *
 * Listens for 'simulation-active' CustomEvent from DataBridge to switch modes.
 */

import { createSwarmCanvas, type SwarmCanvasController } from './swarm-canvas.js';
import { formatElapsed } from './theater-helpers.js';

const DEMO_TIMING: { phase: string; durationMs: number }[] = [
  { phase: 'graph_building', durationMs: 8000 },
  { phase: 'simulating', durationMs: 15000 },
  { phase: 'reporting', durationMs: 5000 },
  { phase: 'completed', durationMs: 5000 },
];

const PHASE_LABELS: Record<string, string> = {
  pending: 'QUEUED FOR ANALYSIS',
  queued: 'QUEUED FOR ANALYSIS',
  graph_building: 'BUILDING KNOWLEDGE GRAPH',
  simulating: 'SWARM CONSENSUS FORMING',
  reporting: 'EXTRACTING PREDICTIONS',
  completed: 'PREDICTIONS EXTRACTED',
};

export interface StanceSummary {
  total: number;
  stances: { escalate: number; de_escalate: number; uncertain: number; neutral: number };
}

export interface SwarmHeroController {
  /** Switch to live mode with real simulation data */
  setLive(phase: string, elapsedMs: number, topic?: string, simId?: string): void;
  /** Update the displayed topic (from intelligence feed or scenario) */
  setTopic(topic: string): void;
  /** Show real stance data from a completed simulation briefly */
  showRealStances(summary: StanceSummary): void;
  /** Switch back to demo loop */
  setDemo(): void;
  destroy(): void;
}

export function createSwarmHero(container: HTMLElement): SwarmHeroController {
  const wrapper = document.createElement('div');
  wrapper.className = 'swarm-hero';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'swarm-hero-canvas';
  wrapper.appendChild(canvasWrap);

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'swarm-hero-overlay';

  const phaseLabel = document.createElement('div');
  phaseLabel.className = 'swarm-hero-phase';
  phaseLabel.textContent = PHASE_LABELS.graph_building;
  overlay.appendChild(phaseLabel);

  const topicEl = document.createElement('div');
  topicEl.className = 'swarm-hero-topic';
  topicEl.textContent = '';
  overlay.appendChild(topicEl);

  const subtitle = document.createElement('div');
  subtitle.className = 'swarm-hero-subtitle';
  subtitle.textContent = '4,096 AI agents reaching consensus';
  overlay.appendChild(subtitle);

  const elapsed = document.createElement('div');
  elapsed.className = 'swarm-hero-elapsed';
  elapsed.textContent = '';
  overlay.appendChild(elapsed);

  // Live stance distribution counter
  const stanceBar = document.createElement('div');
  stanceBar.className = 'swarm-stance-bar';
  overlay.appendChild(stanceBar);

  wrapper.appendChild(overlay);
  container.appendChild(wrapper);

  const w = wrapper.clientWidth || 1400;
  const h = 340;
  canvasWrap.style.height = `${h}px`;

  let canvas: SwarmCanvasController | null = createSwarmCanvas(canvasWrap, {
    particleCount: 350, width: w, height: h, phase: 'graph_building',
  });

  let isLive = false;
  let demoIdx = 0;
  let demoTimer: ReturnType<typeof setTimeout> | null = null;

  let showingRealStances = false;
  let realStanceTimer: ReturnType<typeof setTimeout> | null = null;

  // Update stance distribution counter every 500ms
  const stanceInterval = setInterval(() => {
    if (!canvas || showingRealStances) return;
    const phase = canvas ? 'active' : 'idle';

    if (isLive) {
      // During live mode, show "ANALYZING..." instead of fake numbers
      stanceBar.innerHTML = [
        '<span class="stance-item stance-esc">ANALYZING...</span>',
        '<span class="stance-item stance-deesc">ANALYZING...</span>',
        '<span class="stance-item stance-market">ANALYZING...</span>',
        '<span class="stance-item stance-sent">ANALYZING...</span>',
      ].join('');
    } else if (phase === 'active' && demoIdx >= 1) {
      const dist = canvas.getDistribution();
      stanceBar.innerHTML = [
        `<span class="stance-item stance-esc">ESCALATION ${dist.escalation}%</span>`,
        `<span class="stance-item stance-deesc">DE-ESCALATION ${dist.deEscalation}%</span>`,
        `<span class="stance-item stance-market">MARKET SHIFT ${dist.marketShift}%</span>`,
        `<span class="stance-item stance-sent">SENTIMENT ${dist.sentiment}%</span>`,
      ].join('');
    } else {
      stanceBar.innerHTML = '';
    }
  }, 500);

  function clearDemoTimer(): void {
    if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
  }

  function advanceDemo(): void {
    if (isLive || !canvas) return;
    demoIdx = (demoIdx + 1) % DEMO_TIMING.length;
    const { phase, durationMs } = DEMO_TIMING[demoIdx];
    canvas.setPhase(phase);
    phaseLabel.textContent = PHASE_LABELS[phase] ?? phase;
    elapsed.textContent = '';
    subtitle.textContent = '4,096 AI agents reaching consensus';

    if (demoIdx === 0) {
      canvas.destroy();
      canvas = createSwarmCanvas(canvasWrap, {
        particleCount: 350, width: w, height: h, phase: 'graph_building',
      });
    }
    demoTimer = setTimeout(advanceDemo, durationMs);
  }

  // Start demo loop
  demoTimer = setTimeout(advanceDemo, DEMO_TIMING[0].durationMs);

  return {
    setLive(phase: string, elapsedMs: number, topic?: string, _simId?: string): void {
      if (!isLive) {
        isLive = true;
        clearDemoTimer();
        wrapper.classList.add('swarm-hero--live');
      }
      if (canvas) canvas.setPhase(phase);
      phaseLabel.textContent = PHASE_LABELS[phase] ?? phase;
      elapsed.textContent = formatElapsed(elapsedMs);
      subtitle.textContent = 'LIVE — 4,096 AI agents deliberating';
      if (topic) topicEl.textContent = topic;
    },

    setTopic(topic: string): void {
      topicEl.textContent = topic;
    },

    showRealStances(summary: StanceSummary): void {
      if (summary.total === 0) return;
      showingRealStances = true;
      const s = summary.stances;
      stanceBar.innerHTML = [
        `<span class="stance-item stance-esc">ESCALATION ${s.escalate}%</span>`,
        `<span class="stance-item stance-deesc">DE-ESCALATION ${s.de_escalate}%</span>`,
        `<span class="stance-item stance-market">MARKET SHIFT ${s.uncertain}%</span>`,
        `<span class="stance-item stance-sent">SENTIMENT ${s.neutral}%</span>`,
      ].join('');

      // Revert after 10 seconds
      if (realStanceTimer) clearTimeout(realStanceTimer);
      realStanceTimer = setTimeout(() => {
        showingRealStances = false;
        realStanceTimer = null;
      }, 10_000);
    },

    setDemo(): void {
      if (isLive) {
        isLive = false;
        showingRealStances = false;
        if (realStanceTimer) { clearTimeout(realStanceTimer); realStanceTimer = null; }
        wrapper.classList.remove('swarm-hero--live');
        elapsed.textContent = '';
        subtitle.textContent = '4,096 AI agents reaching consensus';
        // Restart demo from beginning
        demoIdx = -1;
        if (canvas) {
          canvas.destroy();
          canvas = createSwarmCanvas(canvasWrap, {
            particleCount: 350, width: w, height: h, phase: 'graph_building',
          });
        }
        advanceDemo();
      }
    },

    destroy(): void {
      clearDemoTimer();
      clearInterval(stanceInterval);
      if (realStanceTimer) { clearTimeout(realStanceTimer); realStanceTimer = null; }
      if (canvas) { canvas.destroy(); canvas = null; }
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    },
  };
}
