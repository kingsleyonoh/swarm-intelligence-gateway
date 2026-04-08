/**
 * SwarmHero — persistent swarm visualization that replays the simulation
 * cycle when no active simulation is running. Always-visible hero element
 * between the globe and theater cards.
 *
 * Loops: graph_building (8s) → simulating (15s) → reporting (5s) → hold (5s) → restart
 */

import { createSwarmCanvas, type SwarmCanvasController } from './swarm-canvas.js';

const PHASE_TIMING: { phase: string; durationMs: number }[] = [
  { phase: 'graph_building', durationMs: 8000 },
  { phase: 'simulating', durationMs: 15000 },
  { phase: 'reporting', durationMs: 5000 },
  { phase: 'completed', durationMs: 5000 },
];

const PHASE_LABELS: Record<string, string> = {
  graph_building: 'BUILDING KNOWLEDGE GRAPH',
  simulating: 'SWARM CONSENSUS FORMING',
  reporting: 'ANALYZING PREDICTIONS',
  completed: 'PREDICTIONS EXTRACTED',
};

export interface SwarmHeroController {
  /** Pause the demo loop (when a real sim is active) */
  pause(): void;
  /** Resume the demo loop */
  resume(): void;
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

  const subtitle = document.createElement('div');
  subtitle.className = 'swarm-hero-subtitle';
  subtitle.textContent = '4,096 AI agents reaching consensus';
  overlay.appendChild(subtitle);

  wrapper.appendChild(overlay);
  container.appendChild(wrapper);

  // Initialize canvas sized to wrapper
  const w = wrapper.clientWidth || 800;
  const h = 200;
  canvasWrap.style.height = `${h}px`;

  let canvas: SwarmCanvasController | null = createSwarmCanvas(canvasWrap, {
    particleCount: 180,
    width: w,
    height: h,
    phase: 'graph_building',
  });

  let phaseIdx = 0;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function advancePhase(): void {
    if (paused || !canvas) return;
    phaseIdx = (phaseIdx + 1) % PHASE_TIMING.length;
    const { phase, durationMs } = PHASE_TIMING[phaseIdx];
    canvas.setPhase(phase);
    phaseLabel.textContent = PHASE_LABELS[phase] ?? phase;

    // On restart, recreate canvas for fresh particle positions
    if (phaseIdx === 0) {
      canvas.destroy();
      canvas = createSwarmCanvas(canvasWrap, {
        particleCount: 180,
        width: w,
        height: h,
        phase: 'graph_building',
      });
    }

    timer = setTimeout(advancePhase, durationMs);
  }

  // Start first phase
  timer = setTimeout(advancePhase, PHASE_TIMING[0].durationMs);

  return {
    pause(): void {
      paused = true;
      if (timer) { clearTimeout(timer); timer = null; }
      wrapper.style.display = 'none';
    },
    resume(): void {
      paused = false;
      wrapper.style.display = '';
      advancePhase();
    },
    destroy(): void {
      paused = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (canvas) { canvas.destroy(); canvas = null; }
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    },
  };
}
