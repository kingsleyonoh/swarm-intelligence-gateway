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

export interface SwarmHeroController {
  /** Switch to live mode with real simulation data */
  setLive(phase: string, elapsedMs: number, topic?: string): void;
  /** Update the displayed topic (from intelligence feed or scenario) */
  setTopic(topic: string): void;
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

  wrapper.appendChild(overlay);
  container.appendChild(wrapper);

  const w = wrapper.clientWidth || 1400;
  const h = 340;
  canvasWrap.style.height = `${h}px`;

  let canvas: SwarmCanvasController | null = createSwarmCanvas(canvasWrap, {
    particleCount: 250, width: w, height: h, phase: 'graph_building',
  });

  let isLive = false;
  let demoIdx = 0;
  let demoTimer: ReturnType<typeof setTimeout> | null = null;

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
        particleCount: 250, width: w, height: h, phase: 'graph_building',
      });
    }
    demoTimer = setTimeout(advanceDemo, durationMs);
  }

  // Start demo loop
  demoTimer = setTimeout(advanceDemo, DEMO_TIMING[0].durationMs);

  return {
    setLive(phase: string, elapsedMs: number, topic?: string): void {
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

    setDemo(): void {
      if (isLive) {
        isLive = false;
        wrapper.classList.remove('swarm-hero--live');
        elapsed.textContent = '';
        subtitle.textContent = '4,096 AI agents reaching consensus';
        // Restart demo from beginning
        demoIdx = -1;
        if (canvas) {
          canvas.destroy();
          canvas = createSwarmCanvas(canvasWrap, {
            particleCount: 250, width: w, height: h, phase: 'graph_building',
          });
        }
        advanceDemo();
      }
    },

    destroy(): void {
      clearDemoTimer();
      if (canvas) { canvas.destroy(); canvas = null; }
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    },
  };
}
