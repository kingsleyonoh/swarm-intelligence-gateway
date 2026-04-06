/**
 * PredictionTimelinePanel — SVG chart plotting prediction confidence over time.
 *
 * X-axis: timestamps (last 7 days default).
 * Y-axis: confidence (0-1).
 * Dots colored by prediction type. Connected dots for same theater.
 * Hover tooltip with theater, summary, confidence, time horizon.
 */

import type { Panel } from '../types.js';
import type {
  PredictionPoint,
  PredictionTimelineData,
} from './prediction-types.js';
import { PREDICTION_TYPE_COLORS } from './prediction-types.js';
import type { PredictionType } from '../types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Chart dimension constants */
const CHART_WIDTH = 800;
const CHART_HEIGHT = 400;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
const DOT_RADIUS = 5;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class PredictionTimelinePanel implements Panel {
  readonly id = 'prediction-timeline';
  readonly title = 'Prediction Timeline';

  private container: HTMLElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private plotGroup: SVGGElement | null = null;
  private points: PredictionPoint[] = [];

  mount(container: HTMLElement): void {
    this.container = container;

    // Color legend
    const legend = document.createElement('div');
    legend.className = 'color-legend';
    const types: Array<[string, string]> = [
      ['Escalation', '#e05252'], ['De-escalation', '#4a90d9'],
      ['Market Shift', '#d4a843'], ['Sentiment Cascade', '#9b59b6'],
    ];
    for (const [label, color] of types) {
      const item = document.createElement('span');
      item.className = 'color-legend-item';
      const dot = document.createElement('span');
      dot.className = 'color-legend-dot';
      dot.style.backgroundColor = color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(label));
      legend.appendChild(item);
    }
    container.appendChild(legend);

    this.svgEl = document.createElementNS(SVG_NS, 'svg');
    this.svgEl.setAttribute(
      'viewBox',
      `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
    );
    this.svgEl.setAttribute('width', '100%');
    this.svgEl.setAttribute('class', 'prediction-timeline-svg');

    this.plotGroup = document.createElementNS(SVG_NS, 'g');
    this.plotGroup.setAttribute(
      'transform',
      `translate(${MARGIN.left},${MARGIN.top})`,
    );
    this.svgEl.appendChild(this.plotGroup);

    this.renderAxes();
    container.appendChild(this.svgEl);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'prediction-tooltip';
    this.tooltipEl.style.display = 'none';
    this.tooltipEl.style.position = 'absolute';
    container.appendChild(this.tooltipEl);
  }

  unmount(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.svgEl = null;
    this.tooltipEl = null;
    this.plotGroup = null;
    this.points = [];
  }

  update(data: unknown): void {
    if (!this.plotGroup || !this.container) return;
    const tData = data as PredictionTimelineData;
    if (!tData.predictions) return;

    this.points = tData.predictions;
    this.clearPlotData();

    if (this.points.length === 0) {
      this.renderEmpty();
      return;
    }

    this.removeEmpty();
    this.renderDateTicks();
    this.renderTheaterLines();
    this.renderDots();
  }

  private renderAxes(): void {
    if (!this.svgEl || !this.plotGroup) return;

    // Horizontal gridlines + Y-axis ticks
    for (const val of [0, 0.25, 0.5, 0.75, 1]) {
      const y = PLOT_H - val * PLOT_H;

      // Gridline
      const gridline = document.createElementNS(SVG_NS, 'line');
      gridline.setAttribute('x1', '0');
      gridline.setAttribute('y1', String(y));
      gridline.setAttribute('x2', String(PLOT_W));
      gridline.setAttribute('y2', String(y));
      gridline.setAttribute('stroke', '#1e1e35');
      gridline.setAttribute('stroke-width', '1');
      this.plotGroup.appendChild(gridline);

      // Tick label
      const tick = document.createElementNS(SVG_NS, 'text');
      tick.setAttribute('x', '-8');
      tick.setAttribute('y', String(y + 4));
      tick.setAttribute('text-anchor', 'end');
      tick.setAttribute('fill', '#666');
      tick.setAttribute('font-size', '11');
      tick.textContent = val.toFixed(val % 0.5 === 0 ? 1 : 2);
      this.plotGroup.appendChild(tick);
    }

    // Y-axis label
    const yLabel = document.createElementNS(SVG_NS, 'text');
    yLabel.setAttribute('x', String(-CHART_HEIGHT / 2));
    yLabel.setAttribute('y', '14');
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.setAttribute('transform', 'rotate(-90)');
    yLabel.setAttribute('fill', '#666');
    yLabel.setAttribute('font-size', '11');
    yLabel.textContent = 'Confidence';
    this.svgEl.appendChild(yLabel);

    // X-axis date ticks (rendered after update when we know the time range)
    // Static "Time" label as fallback
    const xLabel = document.createElementNS(SVG_NS, 'text');
    xLabel.setAttribute('class', 'x-axis-label');
    xLabel.setAttribute('x', String(CHART_WIDTH / 2));
    xLabel.setAttribute('y', String(CHART_HEIGHT - 4));
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.setAttribute('fill', '#666');
    xLabel.setAttribute('font-size', '11');
    xLabel.textContent = 'Time';
    this.svgEl.appendChild(xLabel);
  }

  private renderDateTicks(): void {
    if (!this.plotGroup) return;
    // Remove old date ticks
    this.plotGroup.querySelectorAll('.date-tick').forEach((el) => el.remove());

    const { minTime, maxTime } = this.getTimeRange();
    const tickCount = 5;
    const step = (maxTime - minTime) / tickCount;

    for (let i = 0; i <= tickCount; i++) {
      const t = minTime + step * i;
      const x = (i / tickCount) * PLOT_W;
      const date = new Date(t);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;

      const tick = document.createElementNS(SVG_NS, 'text');
      tick.setAttribute('class', 'date-tick');
      tick.setAttribute('x', String(x));
      tick.setAttribute('y', String(PLOT_H + 20));
      tick.setAttribute('text-anchor', 'middle');
      tick.setAttribute('fill', '#666');
      tick.setAttribute('font-size', '10');
      tick.textContent = label;
      this.plotGroup.appendChild(tick);
    }
  }

  private clearPlotData(): void {
    if (!this.plotGroup) return;
    const dotsAndLines = this.plotGroup.querySelectorAll(
      '.prediction-dot, .theater-line',
    );
    for (const el of dotsAndLines) {
      el.remove();
    }
  }

  private renderEmpty(): void {
    if (!this.container) return;
    // Remove existing empty message if present
    this.removeEmpty();
    const msg = document.createElement('div');
    msg.className = 'timeline-empty';
    msg.textContent = 'No predictions available';
    this.container.appendChild(msg);
  }

  private removeEmpty(): void {
    const existing = this.container?.querySelector('.timeline-empty');
    if (existing) existing.remove();
  }

  private getTimeRange(): { minTime: number; maxTime: number } {
    const now = Date.now();
    const timestamps = this.points.map((p) =>
      new Date(p.createdAt).getTime(),
    );
    const minTime = Math.min(now - SEVEN_DAYS_MS, ...timestamps);
    const maxTime = Math.max(now, ...timestamps);
    return { minTime, maxTime };
  }

  private scaleX(timestamp: string): number {
    const { minTime, maxTime } = this.getTimeRange();
    const t = new Date(timestamp).getTime();
    const range = maxTime - minTime || 1;
    return ((t - minTime) / range) * PLOT_W;
  }

  private scaleY(confidence: number): number {
    return PLOT_H - confidence * PLOT_H;
  }

  private renderTheaterLines(): void {
    if (!this.plotGroup) return;

    // Group points by theater, sorted by time
    const grouped = new Map<string, PredictionPoint[]>();
    for (const p of this.points) {
      const list = grouped.get(p.theater) ?? [];
      list.push(p);
      grouped.set(p.theater, list);
    }

    for (const [, theaterPoints] of grouped) {
      if (theaterPoints.length < 2) continue;

      const sorted = [...theaterPoints].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime(),
      );

      for (let i = 0; i < sorted.length - 1; i++) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'theater-line');
        line.setAttribute('x1', String(this.scaleX(sorted[i].createdAt)));
        line.setAttribute('y1', String(this.scaleY(sorted[i].confidence)));
        line.setAttribute(
          'x2',
          String(this.scaleX(sorted[i + 1].createdAt)),
        );
        line.setAttribute(
          'y2',
          String(this.scaleY(sorted[i + 1].confidence)),
        );
        line.setAttribute('stroke', 'rgba(255,255,255,0.3)');
        line.setAttribute('stroke-width', '1');
        this.plotGroup.appendChild(line);
      }
    }
  }

  private renderDots(): void {
    if (!this.plotGroup) return;

    for (const point of this.points) {
      const cx = this.scaleX(point.createdAt);
      const cy = this.scaleY(point.confidence);
      const color =
        PREDICTION_TYPE_COLORS[point.predictionType as PredictionType] ??
        '#888';

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'prediction-dot');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(DOT_RADIUS));
      circle.setAttribute('fill', color);
      circle.setAttribute('data-prediction-id', point.id);

      circle.addEventListener('mouseenter', (e) =>
        this.showTooltip(point, e as MouseEvent),
      );
      circle.addEventListener('mouseleave', () => this.hideTooltip());

      this.plotGroup.appendChild(circle);
    }
  }

  private showTooltip(point: PredictionPoint, event: MouseEvent): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${event.offsetX + 12}px`;
    this.tooltipEl.style.top = `${event.offsetY - 8}px`;
    this.tooltipEl.innerHTML = [
      `<strong>${point.theater}</strong>`,
      point.summary,
      `Confidence: ${point.confidence}`,
      `Horizon: ${point.timeHorizon}`,
    ].join('<br>');
  }

  private hideTooltip(): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'none';
  }
}
