/** Rendering primitives for the swarm particle canvas. */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  group: number;
}

export const STANCE_COLORS = ['#e05252', '#4a90d9', '#d4a843', '#9b59b6'];
export const GRAY = '#444444';

const BG_COLOR = '#1A1D26';
const CONNECTION_DIST = 70;
const CONNECTION_ALPHA = 0.06;
const PARTICLE_RADIUS = 3;
const TRAIL_ALPHA = 0.25;

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  phase: string,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.globalAlpha = TRAIL_ALPHA;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = 1;

  if (phase === 'graph_building' || phase === 'simulating') {
    drawConnections(ctx, particles);
  }
  if (phase === 'simulating' || phase === 'reporting' || phase === 'completed') {
    drawClusterGlow(ctx, particles);
  }

  for (const particle of particles) {
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, PARTICLE_RADIUS * 2, 0, Math.PI * 2);
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = 0.04;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(particle.x, particle.y, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
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
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < CONNECTION_DIST) {
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
  const counts = [0, 0, 0, 0];
  const centersX = [0, 0, 0, 0];
  const centersY = [0, 0, 0, 0];
  for (const particle of particles) {
    counts[particle.group]++;
    centersX[particle.group] += particle.x;
    centersY[particle.group] += particle.y;
  }

  for (let group = 0; group < 4; group++) {
    if (counts[group] < 5) continue;
    const centerX = centersX[group] / counts[group];
    const centerY = centersY[group] / counts[group];
    const radius = 20 + counts[group] * 0.5;
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0, centerX, centerY, radius,
    );
    gradient.addColorStop(0, STANCE_COLORS[group]);
    gradient.addColorStop(1, 'transparent');

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.06;
    ctx.fill();
    ctx.restore();
  }
}
