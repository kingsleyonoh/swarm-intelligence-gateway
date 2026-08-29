/**
 * Active Simulation Card — full-width theater card with embedded swarm
 * particle visualization for simulations currently in progress.
 */

import type { TheaterCardData } from './theater-types.js';
import { createSwarmCanvas } from './swarm-canvas.js';
import { formatElapsed } from './theater-helpers.js';

const PHASE_TEXT: Record<string, string> = {
  pending: 'QUEUED FOR SIMULATION',
  queued: 'QUEUED FOR SIMULATION',
  graph_building: 'BUILDING KNOWLEDGE GRAPH',
  simulating: 'RUNNING SWARM SIMULATION',
  reporting: 'GENERATING INTELLIGENCE BRIEF',
};

const PHASE_STEPS = [
  { key: 'graph_building', label: 'Build Graph' },
  { key: 'simulating', label: 'Simulate' },
  { key: 'reporting', label: 'Report' },
  { key: 'completed', label: 'Complete' },
];

/** Order index for phase comparison (lower = earlier) */
const PHASE_ORDER: Record<string, number> = {
  pending: 0,
  queued: 0,
  graph_building: 1,
  simulating: 2,
  reporting: 3,
  completed: 4,
};

function getPhaseOrder(status: string): number {
  return PHASE_ORDER[status] ?? 0;
}

function buildOverlay(data: TheaterCardData): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'swarm-overlay';

  // Phase text
  const phaseText = document.createElement('div');
  phaseText.className = 'swarm-phase-text';
  phaseText.textContent = PHASE_TEXT[data.status ?? ''] ?? 'PROCESSING';
  overlay.appendChild(phaseText);

  // Agent count
  const agentCount = document.createElement('div');
  agentCount.className = 'swarm-agent-count';
  agentCount.textContent = `${data.agentCount.toLocaleString()} agents deliberating`;
  overlay.appendChild(agentCount);

  // Elapsed time (top-right)
  const elapsed = document.createElement('div');
  elapsed.className = 'swarm-elapsed';
  elapsed.textContent = formatElapsed(0);
  overlay.appendChild(elapsed);

  return overlay;
}

function buildPhaseStepper(status: string): HTMLElement {
  const stepper = document.createElement('div');
  stepper.className = 'phase-stepper';
  const currentOrder = getPhaseOrder(status);

  for (const step of PHASE_STEPS) {
    const stepEl = document.createElement('div');
    stepEl.className = 'phase-step';
    const stepOrder = getPhaseOrder(step.key);

    if (stepOrder < currentOrder) {
      stepEl.classList.add('phase-step--done');
    } else if (stepOrder === currentOrder) {
      stepEl.classList.add('phase-step--current');
    }

    const dot = document.createElement('span');
    dot.className = 'phase-dot';
    stepEl.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'phase-label';
    label.textContent = step.label;
    stepEl.appendChild(label);

    stepper.appendChild(stepEl);
  }

  return stepper;
}

export function createActiveSimCard(
  data: TheaterCardData,
  onSwarmClick: () => void,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'theater-card theater-card--active-sim';
  card.dataset.domain = data.domain;
  card.dataset.cardId = data.id;

  // Canvas wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'swarm-canvas-wrapper';

  // Swarm canvas (fills wrapper)
  const canvasCtrl = createSwarmCanvas(wrapper, {
    particleCount: 200,
    width: 600,
    height: 300,
    phase: (data.status as 'idle') ?? 'idle',
  });

  // Set phase on the canvas to match simulation status
  const phase = data.status ?? 'idle';
  canvasCtrl.setPhase(phase);

  // Overlay text on the canvas
  wrapper.appendChild(buildOverlay(data));

  card.appendChild(wrapper);

  // Phase stepper
  card.appendChild(buildPhaseStepper(data.status ?? 'pending'));

  // Click hint
  const hint = document.createElement('div');
  hint.className = 'swarm-click-hint';
  hint.textContent = 'Click to view live feed \u2192';
  card.appendChild(hint);

  // Click handler
  card.addEventListener('click', onSwarmClick);

  return card;
}
