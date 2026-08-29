import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for report reveal animation helpers.
 * We test the initial hidden state application (synchronous),
 * NOT setTimeout-based reveals (async timing in happy-dom is unreliable).
 */

// We need to import the reveal functions — they will be exported from report-view.ts
import { createReportView, revealElements, revealPredictions } from '../../src/components/report-view.js';

describe('revealElements', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('adds report-reveal-hidden class to all children', () => {
    container.innerHTML = '<p>One</p><p>Two</p><p>Three</p>';
    revealElements(container);

    const children = Array.from(container.children);
    for (const child of children) {
      expect(child.classList.contains('report-reveal-hidden')).toBe(true);
    }
  });

  it('adds report-reveal-slide-left to evidence blockquotes', () => {
    container.innerHTML = '<p>Paragraph</p><blockquote class="report-evidence">Evidence</blockquote>';
    revealElements(container);

    const bq = container.querySelector('.report-evidence')!;
    expect(bq.classList.contains('report-reveal-hidden')).toBe(true);
    expect(bq.classList.contains('report-reveal-slide-left')).toBe(true);
  });

  it('does not add slide-left to non-evidence elements', () => {
    container.innerHTML = '<p>Normal paragraph</p>';
    revealElements(container);

    const p = container.querySelector('p')!;
    expect(p.classList.contains('report-reveal-slide-left')).toBe(false);
  });

  it('handles empty container gracefully', () => {
    revealElements(container);
    expect(container.children.length).toBe(0);
  });
});

describe('revealPredictions', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('adds report-reveal-hidden and report-reveal-fan to prediction cards', () => {
    container.innerHTML = `
      <div class="report-prediction-card">Card 1</div>
      <div class="report-prediction-card">Card 2</div>
    `;
    revealPredictions(container);

    const cards = container.querySelectorAll('.report-prediction-card');
    for (const card of cards) {
      expect(card.classList.contains('report-reveal-hidden')).toBe(true);
      expect(card.classList.contains('report-reveal-fan')).toBe(true);
    }
  });

  it('does not affect non-prediction elements', () => {
    container.innerHTML = '<p>Regular content</p><div class="report-prediction-card">Card</div>';
    revealPredictions(container);

    const p = container.querySelector('p')!;
    expect(p.classList.contains('report-reveal-hidden')).toBe(false);
    expect(p.classList.contains('report-reveal-fan')).toBe(false);
  });

  it('handles container with no prediction cards', () => {
    container.innerHTML = '<p>No cards here</p>';
    revealPredictions(container);
    // Should not throw
    expect(container.querySelectorAll('.report-reveal-fan').length).toBe(0);
  });
});

describe('createReportView — upstream language passthrough', () => {
  it('renders persisted predictions and report lines regardless of language', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        report: '# Live report\n\n市场溢出风险正在上升。',
        predictions: [{
          theater: 'Strait of Hormuz',
          predictionType: 'market_shift',
          summary: '市场溢出风险在未来72小时内上升。',
          confidence: '0.65',
          timeHorizon: '72h',
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = createReportView('sim-live', 'Strait of Hormuz', 'key', 'http://localhost:3000', () => {});
    await vi.waitFor(() => expect(view.querySelectorAll('.report-prediction-card')).toHaveLength(1));

    expect(view.textContent).toContain('市场溢出风险');
    vi.unstubAllGlobals();
  });
});
