/**
 * SwarmCanvas — Canvas-based particle simulation showing 4,096 agents
 * forming consensus in real-time. Replaces the progress bar during
 * active simulations with a mesmerizing clustering visualization.
 */

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

export interface SwarmCanvasController {
  setPhase(phase: string): void;
  setPredictions(predictions: PredictionHint[]): void;
  destroy(): void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  group: number; // 0=red/escalation, 1=blue, 2=yellow, 3=purple
}

const STANCE_COLORS = ['#e05252', '#4a90d9', '#d4a843', '#9b59b6'];
const GRAY = '#666666';
const BG_COLOR = '#1A1D26';
const CONNECTION_DIST = 60;
const CONNECTION_ALPHA = 0.08;
const PARTICLE_RADIUS = 3;

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
  p.vx += (Math.random() - 0.5) * 0.1;
  p.vy += (Math.random() - 0.5) * 0.1;
  p.vx *= 0.98;
  p.vy *= 0.98;
  p.x += p.vx;
  p.y += p.vy;
  wrapBounds(p, w, h);
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
  for (let j = 0; j < all.length; j++) {
    if (j === idx) continue;
    const other = all[j];
    const dx = other.x - p.x;
    const dy = other.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist > 120) continue;
    const force = p.group === other.group ? 0.002 : -0.001;
    fx += (dx / dist) * force;
    fy += (dy / dist) * force;
  }
  p.vx += fx + (Math.random() - 0.5) * 0.3;
  p.vy += fy + (Math.random() - 0.5) * 0.3;
  p.vx *= 0.97;
  p.vy *= 0.97;
  p.x += p.vx;
  p.y += p.vy;
  wrapBounds(p, w, h);
}

function updateReporting(p: Particle): void {
  p.vx *= 0.95;
  p.vy *= 0.95;
  p.x += p.vx;
  p.y += p.vy;
}

function wrapBounds(p: Particle, w: number, h: number): void {
  if (p.x < 0) p.x = w;
  if (p.x > w) p.x = 0;
  if (p.y < 0) p.y = h;
  if (p.y > h) p.y = 0;
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  phase: string,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Draw connections in graph_building and simulating phases
  if (phase === 'graph_building' || phase === 'simulating') {
    drawConnections(ctx, particles);
  }

  // Draw particles
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Glow effect on largest cluster in reporting phase
  if (phase === 'reporting') {
    drawClusterGlow(ctx, particles);
  }
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
): void {
  ctx.lineWidth = 0.5;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i];
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONNECTION_DIST) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = a.color;
        ctx.globalAlpha = CONNECTION_ALPHA;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
}

function drawClusterGlow(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
): void {
  // Find center of mass of the largest group
  const counts = [0, 0, 0, 0];
  const cx = [0, 0, 0, 0];
  const cy = [0, 0, 0, 0];
  for (const p of particles) {
    counts[p.group]++;
    cx[p.group] += p.x;
    cy[p.group] += p.y;
  }
  let largest = 0;
  for (let g = 1; g < 4; g++) {
    if (counts[g] > counts[largest]) largest = g;
  }
  if (counts[largest] === 0) return;
  const centerX = cx[largest] / counts[largest];
  const centerY = cy[largest] / counts[largest];

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
  ctx.fillStyle = STANCE_COLORS[largest];
  ctx.globalAlpha = 0.06;
  ctx.shadowBlur = 30;
  ctx.shadowColor = STANCE_COLORS[largest];
  ctx.fill();
  ctx.restore();
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
        updateReporting(p);
      } else if (phase === 'completed') {
        // Freeze — no movement
        p.color = STANCE_COLORS[p.group];
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
