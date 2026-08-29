import type { PredictionPoint } from './prediction-types.js';
import { PREDICTION_TYPE_COLORS } from './prediction-types.js';
import type { PredictionType } from '../types.js';

type Scale = (value: string | number) => number;
type TooltipHandler = (point: PredictionPoint, event: MouseEvent) => void;

export function renderTheaterLines(
  plotGroup: SVGGElement,
  points: PredictionPoint[],
  scaleX: Scale,
  scaleY: Scale,
): void {
  const grouped = new Map<string, PredictionPoint[]>();
  for (const point of points) {
    const group = grouped.get(point.theater) ?? [];
    group.push(point);
    grouped.set(point.theater, group);
  }

  for (const theaterPoints of grouped.values()) {
    if (theaterPoints.length < 2) continue;
    const sorted = [...theaterPoints].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'theater-line');
      line.setAttribute('x1', String(scaleX(sorted[i].createdAt)));
      line.setAttribute('y1', String(scaleY(sorted[i].confidence)));
      line.setAttribute('x2', String(scaleX(sorted[i + 1].createdAt)));
      line.setAttribute('y2', String(scaleY(sorted[i + 1].confidence)));
      line.setAttribute('stroke', 'rgba(255,255,255,0.4)');
      line.setAttribute('stroke-width', '1.5');
      plotGroup.appendChild(line);
    }
  }
}

export function renderDots(
  plotGroup: SVGGElement,
  points: PredictionPoint[],
  scaleX: Scale,
  scaleY: Scale,
  showTooltip: TooltipHandler,
  hideTooltip: () => void,
): void {
  const timestampCounts = new Map<string, number>();
  const timestampIndexes = new Map<string, number>();
  for (const point of points) {
    timestampCounts.set(point.createdAt, (timestampCounts.get(point.createdAt) ?? 0) + 1);
  }

  for (const point of points) {
    const index = timestampIndexes.get(point.createdAt) ?? 0;
    timestampIndexes.set(point.createdAt, index + 1);
    const total = timestampCounts.get(point.createdAt) ?? 1;
    const jitter = total > 1 ? (index - (total - 1) / 2) * 10 : 0;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'prediction-dot');
    circle.setAttribute('cx', String(scaleX(point.createdAt) + jitter));
    circle.setAttribute('cy', String(scaleY(point.confidence)));
    circle.setAttribute('r', '8');
    circle.setAttribute(
      'fill',
      PREDICTION_TYPE_COLORS[point.predictionType as PredictionType] ?? '#888',
    );
    circle.setAttribute('data-prediction-id', point.id);
    circle.addEventListener('mouseenter', (event) => showTooltip(point, event as MouseEvent));
    circle.addEventListener('mouseleave', hideTooltip);
    plotGroup.appendChild(circle);
  }
}
