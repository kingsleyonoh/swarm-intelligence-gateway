/**
 * FactionMapPanel — D3 force-directed SVG graph of faction relationships.
 *
 * Nodes represent factions (sized by member count, colored by stance).
 * Edges represent influence flows (stroke width by weight).
 * Uses D3 force simulation for physics-based layout.
 */

import type { Panel } from '../types.js';
import type { FactionGraphData, FactionNode } from './faction-types.js';
import { STANCE_COLORS } from './faction-types.js';
import {
  createForceSimulation,
  type ForceNode,
  type ForceEdge,
  type ForceSimResult,
} from './faction-force-sim.js';

interface SimNode extends FactionNode { x: number; y: number; }
interface SimEdge { source: SimNode; target: SimNode; weight: number; }

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 600;
const VIEW_H = 400;
const MIN_R = 10;
const MAX_R = 40;
const LABEL_INSIDE_R = 28;
const WARMUP_TICKS = 60;

export class FactionMapPanel implements Panel {
  readonly id = 'faction-map';
  readonly title = 'Faction Map';

  private container: HTMLElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private edgeGroup: SVGGElement | null = null;
  private nodeGroup: SVGGElement | null = null;
  private labelGroup: SVGGElement | null = null;
  private simNodes: SimNode[] = [];
  private simEdges: SimEdge[] = [];
  private forceSim: ForceSimResult | null = null;
  private updateCount = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    this.svgEl = document.createElementNS(SVG_NS, 'svg');
    this.svgEl.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    this.svgEl.setAttribute('width', '100%');
    this.svgEl.setAttribute('class', 'faction-map-svg');
    this.svgEl.style.display = 'block';

    this.appendGridDefs(this.svgEl);

    this.edgeGroup = this.appendGroup('edges');
    this.nodeGroup = this.appendGroup('nodes');
    this.labelGroup = this.appendGroup('labels');
    container.appendChild(this.svgEl);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'faction-tooltip';
    this.tooltipEl.style.display = 'none';
    this.tooltipEl.style.position = 'absolute';
    container.appendChild(this.tooltipEl);
  }

  unmount(): void {
    if (this.forceSim) { this.forceSim.stop(); this.forceSim = null; }
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.svgEl = null;
    this.tooltipEl = null;
    this.edgeGroup = null;
    this.nodeGroup = null;
    this.labelGroup = null;
    this.simNodes = [];
    this.simEdges = [];
    this.updateCount = 0;
  }

  update(data: unknown): void {
    if (!this.svgEl || !this.container) return;
    const graphData = data as FactionGraphData;
    if (!graphData.nodes || !graphData.edges) return;
    this.buildSimData(graphData);
    this.renderEdges();
    this.renderNodes();
    this.renderLabels();
  }

  private appendGroup(cls: string): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', cls);
    this.svgEl!.appendChild(g);
    return g;
  }

  private appendGridDefs(svg: SVGSVGElement): void {
    const defs = document.createElementNS(SVG_NS, 'defs');
    const pat = document.createElementNS(SVG_NS, 'pattern');
    pat.setAttribute('id', 'grid-pattern');
    pat.setAttribute('width', '30');
    pat.setAttribute('height', '30');
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 30 0 L 0 0 0 30');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(26,29,38,0.06)');
    path.setAttribute('stroke-width', '0.5');
    pat.appendChild(path);
    defs.appendChild(pat);
    svg.appendChild(defs);

    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', String(VIEW_W));
    bg.setAttribute('height', String(VIEW_H));
    bg.setAttribute('fill', 'url(#grid-pattern)');
    svg.appendChild(bg);
  }

  private buildSimData(data: FactionGraphData): void {
    if (this.forceSim) { this.forceSim.stop(); this.forceSim = null; }

    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const lr = Math.min(VIEW_W, VIEW_H) * 0.32;

    const forceNodes: ForceNode[] = data.nodes.map((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(data.nodes.length, 1) - Math.PI / 2;
      return { id: n.id, x: cx + Math.cos(a) * lr, y: cy + Math.sin(a) * lr, stance: n.stance, memberCount: n.memberCount };
    });

    const forceEdges: ForceEdge[] = data.edges.map((e) => ({
      source: e.source, target: e.target, weight: e.weight,
    }));

    this.forceSim = createForceSimulation(forceNodes, forceEdges, {
      width: VIEW_W, height: VIEW_H,
      onTick: () => { /* positions updated in-place */ },
    });

    for (let i = 0; i < WARMUP_TICKS; i++) this.forceSim.tick();
    this.forceSim.stop();
    this.updateCount++;

    const nodeMap = new Map<string, SimNode>();
    this.simNodes = data.nodes.map((n, idx) => {
      const fn = forceNodes[idx];
      const sn: SimNode = { ...n, x: fn.x, y: fn.y };
      nodeMap.set(n.id, sn);
      return sn;
    });

    this.simEdges = [];
    for (const edge of data.edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (src && tgt) this.simEdges.push({ source: src, target: tgt, weight: edge.weight });
    }
  }

  private renderEdges(): void {
    if (!this.edgeGroup) return;
    this.edgeGroup.innerHTML = '';
    for (const edge of this.simEdges) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'faction-edge');
      line.setAttribute('x1', String(edge.source.x));
      line.setAttribute('y1', String(edge.source.y));
      line.setAttribute('x2', String(edge.target.x));
      line.setAttribute('y2', String(edge.target.y));
      const color = STANCE_COLORS[edge.source.stance] ?? '#888';
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-opacity', '0.3');
      line.setAttribute('stroke-width', String(this.scaleStroke(edge.weight)));
      this.edgeGroup.appendChild(line);
    }
  }

  private renderNodes(): void {
    if (!this.nodeGroup) return;
    this.nodeGroup.innerHTML = '';
    const counts = this.simNodes.map((n) => n.memberCount);
    const minC = Math.min(...counts, 0);
    const maxC = Math.max(...counts, 1);

    for (const node of this.simNodes) {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'faction-node');
      circle.setAttribute('cx', String(node.x));
      circle.setAttribute('cy', String(node.y));
      circle.setAttribute('r', String(this.scaleRadius(node.memberCount, minC, maxC)));
      circle.setAttribute('fill', STANCE_COLORS[node.stance] ?? '#888');
      circle.setAttribute('data-node-id', node.id);
      if (this.updateCount > 1) circle.classList.add('faction-node--updating');
      circle.addEventListener('mouseenter', (e) => this.showTooltip(node, e as MouseEvent));
      circle.addEventListener('mouseleave', () => this.hideTooltip());
      this.nodeGroup.appendChild(circle);
    }
  }

  private renderLabels(): void {
    if (!this.labelGroup) return;
    this.labelGroup.innerHTML = '';
    const counts = this.simNodes.map((n) => n.memberCount);
    const minC = Math.min(...counts, 0);
    const maxC = Math.max(...counts, 1);

    for (const node of this.simNodes) {
      const r = this.scaleRadius(node.memberCount, minC, maxC);
      // Only label large nodes (inside the circle) — small nodes use hover tooltip
      if (r < LABEL_INSIDE_R) continue;

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'faction-label');
      text.setAttribute('x', String(node.x));
      text.setAttribute('y', String(node.y + 5));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#fff');
      text.setAttribute('font-size', '11');
      const label = node.name.length > 14 ? node.name.slice(0, 12) + '...' : node.name;
      text.textContent = label;
      this.labelGroup.appendChild(text);
    }
  }

  private scaleRadius(count: number, min: number, max: number): number {
    if (max === min) return (MIN_R + MAX_R) / 2;
    const t = (count - min) / (max - min);
    return MIN_R + t * (MAX_R - MIN_R);
  }

  private scaleStroke(weight: number): number {
    return 1 + weight * 3;
  }

  private showTooltip(node: SimNode, event: MouseEvent): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${event.offsetX + 12}px`;
    this.tooltipEl.style.top = `${event.offsetY - 8}px`;

    // Theater nodes have 'neutral' stance, prediction-type nodes have real stances
    if (node.stance === 'neutral') {
      // Theater node — show connected prediction types
      const connected = this.simEdges
        .filter((e) => e.source.id === node.id || e.target.id === node.id)
        .map((e) => e.source.id === node.id ? e.target.name : e.source.name);
      this.tooltipEl.innerHTML = [
        `<strong>${node.name}</strong>`,
        `Theater region`,
        connected.length > 0 ? `Predictions: ${connected.join(', ')}` : '',
      ].filter(Boolean).join('<br>');
    } else {
      // Prediction-type node — show stance and connected theaters
      const stanceLabel = node.stance === 'escalate' ? 'Escalation risk'
        : node.stance === 'de_escalate' ? 'De-escalation signal'
        : 'Market/sentiment shift';
      const connected = this.simEdges
        .filter((e) => e.source.id === node.id || e.target.id === node.id)
        .map((e) => e.source.id === node.id ? e.target.name : e.source.name)
        .filter((n) => n !== node.name);
      this.tooltipEl.innerHTML = [
        `<strong>${node.name}</strong>`,
        stanceLabel,
        connected.length > 0 ? `Theaters: ${connected.join(', ')}` : '',
      ].filter(Boolean).join('<br>');
    }
  }

  private hideTooltip(): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'none';
  }
}
