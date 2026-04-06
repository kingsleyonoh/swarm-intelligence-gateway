/**
 * FactionMapPanel — D3 force-directed SVG graph of faction relationships.
 *
 * Nodes represent factions (sized by member count, colored by stance).
 * Edges represent influence flows (stroke width by weight).
 * Uses D3 force simulation for layout with smooth position transitions.
 */

import type { Panel } from '../types.js';
import type {
  FactionGraphData,
  FactionNode,
} from './faction-types.js';
import { STANCE_COLORS } from './faction-types.js';

/** D3 simulation node with position */
interface SimNode extends FactionNode {
  x: number;
  y: number;
}

/** D3 simulation edge with resolved nodes */
interface SimEdge {
  source: SimNode;
  target: SimNode;
  weight: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_RADIUS = 10;
const MAX_RADIUS = 40;
const MIN_STROKE = 1;
const MAX_STROKE = 4;
const EDGE_COLOR = 'rgba(255,255,255,0.3)';

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
  private animationFrame: number | null = null;

  mount(container: HTMLElement): void {
    this.container = container;

    this.svgEl = document.createElementNS(SVG_NS, 'svg');
    this.svgEl.setAttribute('width', '100%');
    this.svgEl.setAttribute('height', '100%');
    this.svgEl.setAttribute('class', 'faction-map-svg');

    this.edgeGroup = document.createElementNS(SVG_NS, 'g');
    this.edgeGroup.setAttribute('class', 'edges');
    this.svgEl.appendChild(this.edgeGroup);

    this.nodeGroup = document.createElementNS(SVG_NS, 'g');
    this.nodeGroup.setAttribute('class', 'nodes');
    this.svgEl.appendChild(this.nodeGroup);

    this.labelGroup = document.createElementNS(SVG_NS, 'g');
    this.labelGroup.setAttribute('class', 'labels');
    this.svgEl.appendChild(this.labelGroup);

    container.appendChild(this.svgEl);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'faction-tooltip';
    this.tooltipEl.style.display = 'none';
    this.tooltipEl.style.position = 'absolute';
    container.appendChild(this.tooltipEl);
  }

  unmount(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.svgEl = null;
    this.tooltipEl = null;
    this.edgeGroup = null;
    this.nodeGroup = null;
    this.labelGroup = null;
    this.simNodes = [];
    this.simEdges = [];
  }

  update(data: unknown): void {
    if (!this.svgEl || !this.container) return;
    const graphData = data as FactionGraphData;
    if (!graphData.nodes || !graphData.edges) return;

    this.buildSimData(graphData);
    this.renderGraph();
  }

  private buildSimData(data: FactionGraphData): void {
    const width = this.container?.clientWidth ?? 800;
    const height = this.container?.clientHeight ?? 600;
    const cx = width / 2;
    const cy = height / 2;

    // Create sim nodes with initial positions
    const nodeMap = new Map<string, SimNode>();
    this.simNodes = data.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(data.nodes.length, 1);
      const simNode: SimNode = {
        ...n,
        x: cx + Math.cos(angle) * 100,
        y: cy + Math.sin(angle) * 100,
      };
      nodeMap.set(n.id, simNode);
      return simNode;
    });

    // Resolve edges
    this.simEdges = [];
    for (const edge of data.edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (src && tgt) {
        this.simEdges.push({ source: src, target: tgt, weight: edge.weight });
      }
    }
  }

  private renderGraph(): void {
    this.renderEdges();
    this.renderNodes();
    this.renderLabels();
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
      line.setAttribute('stroke', EDGE_COLOR);
      line.setAttribute(
        'stroke-width',
        String(this.scaleStroke(edge.weight)),
      );
      this.edgeGroup.appendChild(line);
    }
  }

  private renderNodes(): void {
    if (!this.nodeGroup) return;
    this.nodeGroup.innerHTML = '';

    const memberCounts = this.simNodes.map((n) => n.memberCount);
    const minCount = Math.min(...memberCounts, 0);
    const maxCount = Math.max(...memberCounts, 1);

    for (const node of this.simNodes) {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'faction-node');
      circle.setAttribute('cx', String(node.x));
      circle.setAttribute('cy', String(node.y));
      circle.setAttribute(
        'r',
        String(this.scaleRadius(node.memberCount, minCount, maxCount)),
      );
      circle.setAttribute('fill', STANCE_COLORS[node.stance] ?? '#888');
      circle.setAttribute('data-node-id', node.id);

      circle.addEventListener('mouseenter', (e) =>
        this.showTooltip(node, e as MouseEvent),
      );
      circle.addEventListener('mouseleave', () => this.hideTooltip());

      this.nodeGroup.appendChild(circle);
    }
  }

  private renderLabels(): void {
    if (!this.labelGroup) return;
    this.labelGroup.innerHTML = '';

    for (const node of this.simNodes) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'faction-label');
      text.setAttribute('x', String(node.x));
      text.setAttribute('y', String(node.y + MAX_RADIUS + 14));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#ccc');
      text.setAttribute('font-size', '12');
      text.textContent = node.name;
      this.labelGroup.appendChild(text);
    }
  }

  private scaleRadius(
    count: number,
    minCount: number,
    maxCount: number,
  ): number {
    if (maxCount === minCount) return (MIN_RADIUS + MAX_RADIUS) / 2;
    const t = (count - minCount) / (maxCount - minCount);
    return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
  }

  private scaleStroke(weight: number): number {
    return MIN_STROKE + weight * (MAX_STROKE - MIN_STROKE);
  }

  private showTooltip(node: SimNode, event: MouseEvent): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${event.offsetX + 12}px`;
    this.tooltipEl.style.top = `${event.offsetY - 8}px`;
    this.tooltipEl.innerHTML = [
      `<strong>${node.name}</strong>`,
      `Members: ${node.memberCount}`,
      `Stance: ${node.stance}`,
      `Key agents: ${node.keyAgents.join(', ')}`,
    ].join('<br>');
  }

  private hideTooltip(): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'none';
  }
}
