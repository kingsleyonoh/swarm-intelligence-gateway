import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createActiveSimCard } from '../../src/components/sim-card-active.js';
import type { TheaterCardData } from '../../src/components/theater-types.js';

/** Stub CanvasRenderingContext2D for happy-dom */
function mockCanvas(): void {
  const noop = vi.fn();
  const mockCtx = {
    clearRect: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    save: noop,
    restore: noop,
    fillRect: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: '',
    canvas: { width: 600, height: 300 },
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
}

function makeCard(overrides: Partial<TheaterCardData> = {}): TheaterCardData {
  return {
    id: 'sim-1',
    theater: 'Test Theater',
    domain: 'conflict',
    agentCount: 4096,
    currentRound: 3,
    totalRounds: 5,
    topPrediction: 'Escalation likely in next 72 hours',
    predictionType: 'Escalation',
    timeHorizon: '72h',
    predictedAt: '2026-04-07T12:00:00Z',
    confidence: 0.85,
    factionSplit: [
      { stance: 'escalate', label: 'Hawks', percentage: 45 },
      { stance: 'de_escalate', label: 'Doves', percentage: 30 },
      { stance: 'uncertain', label: 'Neutral', percentage: 25 },
    ],
    agentDebate: [],
    status: 'simulating',
    ...overrides,
  };
}

describe('createActiveSimCard', () => {
  let container: HTMLElement;

  beforeEach(() => {
    mockCanvas();
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('creates a card with .theater-card--active-sim class', () => {
    const card = createActiveSimCard(makeCard(), vi.fn());
    expect(card.classList.contains('theater-card--active-sim')).toBe(true);
  });

  it('contains swarm canvas wrapper', () => {
    const card = createActiveSimCard(makeCard(), vi.fn());
    const wrapper = card.querySelector('.swarm-canvas-wrapper');
    expect(wrapper).not.toBeNull();
  });

  it('contains a canvas element inside the wrapper', () => {
    const card = createActiveSimCard(makeCard(), vi.fn());
    const canvas = card.querySelector('.swarm-canvas-wrapper canvas');
    expect(canvas).not.toBeNull();
  });

  it('contains phase stepper with 4 steps', () => {
    const card = createActiveSimCard(makeCard(), vi.fn());
    const steps = card.querySelectorAll('.phase-step');
    expect(steps.length).toBe(4);
  });

  it('phase stepper labels are correct', () => {
    const card = createActiveSimCard(makeCard(), vi.fn());
    const steps = card.querySelectorAll('.phase-step');
    const labels = Array.from(steps).map(
      (s) => s.querySelector('.phase-label')?.textContent,
    );
    expect(labels).toEqual([
      'Build Graph',
      'Simulate',
      'Report',
      'Complete',
    ]);
  });

  it('marks completed phases with --done class', () => {
    const card = createActiveSimCard(
      makeCard({ status: 'simulating' }),
      vi.fn(),
    );
    const steps = card.querySelectorAll('.phase-step');
    // graph_building should be done, simulating should be current
    expect(steps[0].classList.contains('phase-step--done')).toBe(true);
    expect(steps[1].classList.contains('phase-step--current')).toBe(true);
    expect(steps[2].classList.contains('phase-step--done')).toBe(false);
  });

  it('shows agent count text', () => {
    const card = createActiveSimCard(makeCard({ agentCount: 4096 }), vi.fn());
    const agentText = card.querySelector('.swarm-agent-count');
    expect(agentText).not.toBeNull();
    expect(agentText?.textContent).toContain('4,096');
  });

  it('shows phase label text', () => {
    const card = createActiveSimCard(
      makeCard({ status: 'simulating' }),
      vi.fn(),
    );
    const label = card.querySelector('.swarm-phase-text');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('RUNNING SWARM SIMULATION');
  });

  it('shows different phase text for graph_building', () => {
    const card = createActiveSimCard(
      makeCard({ status: 'graph_building' }),
      vi.fn(),
    );
    const label = card.querySelector('.swarm-phase-text');
    expect(label?.textContent).toBe('BUILDING KNOWLEDGE GRAPH');
  });

  it('shows elapsed time element', () => {
    const card = createActiveSimCard(makeCard(), vi.fn());
    const elapsed = card.querySelector('.swarm-elapsed');
    expect(elapsed).not.toBeNull();
  });

  it('shows click hint text', () => {
    const card = createActiveSimCard(makeCard(), vi.fn());
    const hint = card.querySelector('.swarm-click-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('Click to view live feed');
  });

  it('clicking the card triggers the callback', () => {
    const onClick = vi.fn();
    const card = createActiveSimCard(makeCard(), onClick);
    card.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets data-domain on the card', () => {
    const card = createActiveSimCard(
      makeCard({ domain: 'market' }),
      vi.fn(),
    );
    expect(card.dataset.domain).toBe('market');
  });

  it('sets data-card-id on the card', () => {
    const card = createActiveSimCard(
      makeCard({ id: 'sim-42' }),
      vi.fn(),
    );
    expect(card.dataset.cardId).toBe('sim-42');
  });
});
