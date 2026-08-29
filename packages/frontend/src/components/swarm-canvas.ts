/**
 * SwarmCanvas — Canvas-based particle simulation showing 4,096 agents
 * forming consensus in real-time. Replaces the progress bar during
 * active simulations with a mesmerizing clustering visualization.
 */

import {
  drawParticles,
  GRAY,
  STANCE_COLORS,
  type Particle,
} from './swarm-canvas-rendering.js';

export interface SwarmCanvasConfig {
  particleCount: number;
  width: number;
  height: number;
  phase: 'idle' | 'graph_building' | 'simulating' | 'reporting' | 'completed';
  predictions?: PredictionHint[];
}

export interface PredictionHint {
  type: string;
  confidence: number;
}

export interface StanceDistribution {
  escalation: number;
  deEscalation: number;
  marketShift: number;
  sentiment: number;
}

export interface SwarmCanvasController {
  setPhase(phase: string): void;
  setPredictions(predictions: PredictionHint[]): void;
  getDistribution(): StanceDistribution;
  destroy(): void;
}

/** Assign a stance group based on distribution: 40% red, 30% blue, 20% yellow, 10% purple */
function assignGroup(index: number, total: number): number {
  const pct = index / total;
  if (pct < 0.4) return 0;
  if (pct < 0.7) return 1;
  if (pct < 0.9) return 2;
  return 3;
}

function initParticles(count: number, w: number, h: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      color: GRAY,
      group: assignGroup(i, count),
    });
  }
  return particles;
}

function updateGraphBuilding(p: Particle, w: number, h: number): void {
  // Gentle drift with occasional bursts — like neurons waking up
  p.vx += (Math.random() - 0.5) * 0.15;
  p.vy += (Math.random() - 0.5) * 0.15;
  p.vx *= 0.97;
  p.vy *= 0.97;
  // Slowly start tinting toward final color
  p.color = GRAY;
  p.x += p.vx;
  p.y += p.vy;
  softBounds(p, w, h);
}

function updateSimulating(
  p: Particle,
  all: Particle[],
  idx: number,
  w: number,
  h: number,
): void {
  p.color = STANCE_COLORS[p.group];
  let fx = 0;
  let fy = 0;

  // Only sample ~30 particles for performance + organic feel
  const step = Math.max(1, Math.floor(all.length / 30));
  for (let j = 0; j < all.length; j += step) {
    if (j === idx) continue;
    const other = all[j];
    const dx = other.x - p.x;
    const dy = other.y - p.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > 40000) continue; // 200px radius
    const dist = Math.sqrt(distSq) || 1;

    if (p.group === other.group) {
      // Strong attraction to same stance — this creates visible clusters
      fx += (dx / dist) * 0.015;
      fy += (dy / dist) * 0.015;
    } else {
      // Moderate repulsion from different stance
      fx -= (dx / dist) * 0.004;
      fy -= (dy / dist) * 0.004;
    }
  }

  // Add organic noise but less than the clustering force
  p.vx += fx + (Math.random() - 0.5) * 0.2;
  p.vy += fy + (Math.random() - 0.5) * 0.2;
  // Speed limit for smooth movement
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed > 2.5) { p.vx *= 2.5 / speed; p.vy *= 2.5 / speed; }
  p.vx *= 0.96;
  p.vy *= 0.96;
  p.x += p.vx;
  p.y += p.vy;
  softBounds(p, w, h);
}

function updateReporting(p: Particle, w: number, h: number): void {
  // Slow down but NEVER freeze — gentle drift within clusters
  p.vx += (Math.random() - 0.5) * 0.08;
  p.vy += (Math.random() - 0.5) * 0.08;
  p.vx *= 0.93;
  p.vy *= 0.93;
  p.x += p.vx;
  p.y += p.vy;
  softBounds(p, w, h);
}

/** Soft boundary — particles bounce off edges with dampening */
function softBounds(p: Particle, w: number, h: number): void {
  const margin = 10;
  if (p.x < margin) { p.x = margin; p.vx = Math.abs(p.vx) * 0.5; }
  if (p.x > w - margin) { p.x = w - margin; p.vx = -Math.abs(p.vx) * 0.5; }
  if (p.y < margin) { p.y = margin; p.vy = Math.abs(p.vy) * 0.5; }
  if (p.y > h - margin) { p.y = h - margin; p.vy = -Math.abs(p.vy) * 0.5; }
}

export function createSwarmCanvas(
  container: HTMLElement,
  config: SwarmCanvasConfig,
): SwarmCanvasController {
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const particles = initParticles(
    config.particleCount,
    config.width,
    config.height,
  );
  let phase = config.phase;
  let predictions: PredictionHint[] = config.predictions ?? [];
  let animId = 0;

  function tick(): void {
    const w = config.width;
    const h = config.height;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (phase === 'graph_building') {
        updateGraphBuilding(p, w, h);
      } else if (phase === 'simulating') {
        updateSimulating(p, particles, i, w, h);
      } else if (phase === 'reporting') {
        p.color = STANCE_COLORS[p.group];
        updateReporting(p, w, h);
      } else if (phase === 'completed') {
        // Gentle drift — never fully freeze
        p.color = STANCE_COLORS[p.group];
        updateReporting(p, w, h);
      }
      // idle: no updates
    }

    if (ctx) {
      drawParticles(ctx, particles, phase);
    }

    animId = requestAnimationFrame(tick);
  }

  animId = requestAnimationFrame(tick);

  function redistributeForPredictions(preds: PredictionHint[]): void {
    if (preds.length === 0) return;
    const typeToGroup: Record<string, number> = {};
    const lowerTypes = preds.map((p) => p.type.toLowerCase());
    for (const t of lowerTypes) {
      if (t.includes('escalat') && !t.includes('de-')) {
        typeToGroup[t] = 0;
      } else if (t.includes('de-escalat') || t.includes('de_escalat')) {
        typeToGroup[t] = 1;
      } else if (t.includes('market') || t.includes('uncertain')) {
        typeToGroup[t] = 2;
      } else {
        typeToGroup[t] = 3;
      }
    }
    // Count total confidence to distribute proportionally
    const totalConf = preds.reduce((s, p) => s + p.confidence, 0);
    let idx = 0;
    for (const pred of preds) {
      const group = typeToGroup[pred.type.toLowerCase()] ?? 3;
      const count = Math.round(
        (pred.confidence / totalConf) * particles.length,
      );
      for (let i = 0; i < count && idx < particles.length; i++, idx++) {
        particles[idx].group = group;
        particles[idx].color = STANCE_COLORS[group];
      }
    }
    // Fill remainder
    for (; idx < particles.length; idx++) {
      const lastGroup = preds.length > 0
        ? (typeToGroup[preds[preds.length - 1].type.toLowerCase()] ?? 3)
        : 3;
      particles[idx].group = lastGroup;
      particles[idx].color = STANCE_COLORS[lastGroup];
    }
  }

  return {
    setPhase(newPhase: string): void {
      phase = newPhase as SwarmCanvasConfig['phase'];
      if (phase === 'completed' && predictions.length > 0) {
        redistributeForPredictions(predictions);
      }
    },
    getDistribution(): StanceDistribution {
      const counts = [0, 0, 0, 0];
      for (const p of particles) counts[p.group]++;
      const total = particles.length || 1;
      return {
        escalation: Math.round((counts[0] / total) * 100),
        deEscalation: Math.round((counts[1] / total) * 100),
        marketShift: Math.round((counts[2] / total) * 100),
        sentiment: Math.round((counts[3] / total) * 100),
      };
    },
    setPredictions(preds: PredictionHint[]): void {
      predictions = preds;
      if (phase === 'completed') {
        redistributeForPredictions(predictions);
      }
    },
    destroy(): void {
      cancelAnimationFrame(animId);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    },
  };
}
