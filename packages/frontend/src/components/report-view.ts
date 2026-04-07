/**
 * Report View — renders a full simulation report when a theater card is clicked.
 *
 * Fetches the report from GET /api/simulations/:id/report, converts simple
 * Markdown to HTML, and displays predictions as a structured summary.
 */

const PREDICTION_COLORS: Record<string, string> = {
  escalation: '#B83A2F',
  de_escalation: '#2B6CB0',
  market_shift: '#A16B1D',
  sentiment_cascade: '#7C3AED',
};

const PREDICTION_BG: Record<string, string> = {
  escalation: '#FDF2F0',
  de_escalation: '#EFF6FF',
  market_shift: '#FEF9EE',
  sentiment_cascade: '#F5F0FF',
};

const CJK = /[\u4e00-\u9fff]/;

/** Convert Markdown to structured HTML with enhanced formatting */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let isFirstBlockquote = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || CJK.test(trimmed)) continue;
    if (trimmed === '---') { result.push('<hr>'); continue; }
    if (trimmed.startsWith('## ')) {
      result.push(`<h3 class="report-section-heading">${esc(trimmed.slice(3))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      result.push(`<h2 class="report-title">${esc(trimmed.slice(2))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('> ')) {
      const cls = isFirstBlockquote ? 'report-executive-summary' : 'report-evidence';
      result.push(`<blockquote class="${cls}"><span class="evidence-label">Source</span>${esc(trimmed.slice(2))}</blockquote>`);
      isFirstBlockquote = false;
      continue;
    }
    result.push(`<p>${boldify(esc(trimmed))}</p>`);
  }
  return result.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function boldify(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

interface ReportPrediction {
  theater: string;
  predictionType: string;
  summary: string;
  confidence: string | number;
  timeHorizon: string;
}

interface ReportData {
  report: string;
  predictions: ReportPrediction[];
}

async function fetchReport(simId: string, apiKey: string, baseUrl: string): Promise<ReportData> {
  const base = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/simulations/${simId}/report`, {
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Report unavailable (${res.status})`);
  return res.json() as Promise<ReportData>;
}

function formatType(type: string): string {
  return (type || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildPredictionsSummary(predictions: ReportPrediction[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'report-predictions';
  section.innerHTML = `<h3>Extracted Predictions</h3><p class="report-predictions-subtitle">${predictions.length} prediction${predictions.length !== 1 ? 's' : ''} extracted from simulation analysis</p>`;

  const grid = document.createElement('div');
  grid.className = 'report-predictions-grid';

  for (const pred of predictions) {
    const conf = typeof pred.confidence === 'string' ? parseFloat(pred.confidence) : pred.confidence;
    const color = PREDICTION_COLORS[pred.predictionType] ?? '#6B6B7A';
    const bg = PREDICTION_BG[pred.predictionType] ?? '#F5F5F5';
    const label = formatType(pred.predictionType);

    const card = document.createElement('div');
    card.className = 'report-prediction-card';
    card.style.borderLeftColor = color;
    card.style.background = bg;

    card.innerHTML = `
      <div class="report-pred-header">
        <span class="report-pred-badge" style="background:${color}">${esc(label)}</span>
        <span class="report-pred-conf">${Math.round(conf * 100)}%</span>
        <span class="report-pred-horizon">${esc(pred.timeHorizon)}</span>
      </div>
      <p class="report-pred-summary">${esc(pred.summary)}</p>
    `;
    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

export function createReportView(
  simId: string,
  theaterName: string,
  apiKey: string,
  baseUrl: string,
  onBack: () => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'report-view';

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'debate-back-btn';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', onBack);
  container.appendChild(backBtn);

  // Hero banner
  const hero = document.createElement('div');
  hero.className = 'report-hero';
  hero.innerHTML = `
    <span class="report-hero-label">Intelligence Brief</span>
    <h2 class="report-hero-theater">${esc(theaterName)}</h2>
    <span class="report-loading">Fetching analysis...</span>
  `;
  container.appendChild(hero);

  const content = document.createElement('div');
  content.className = 'report-content';
  container.appendChild(content);

  fetchReport(simId, apiKey, baseUrl)
    .then((data) => {
      const loadingEl = hero.querySelector('.report-loading');
      if (loadingEl) loadingEl.remove();

      const englishPreds = data.predictions.filter((p) => !CJK.test(p.summary ?? ''));
      if (englishPreds.length > 0) {
        const count = document.createElement('span');
        count.className = 'report-hero-stat';
        count.textContent = `${englishPreds.length} predictions extracted`;
        hero.appendChild(count);

        // Predictions first — key takeaways before full report
        container.insertBefore(buildPredictionsSummary(englishPreds), content);
      }

      content.innerHTML = markdownToHtml(data.report);
    })
    .catch((err) => {
      content.innerHTML = `<p class="report-error">Failed to load report: ${esc(String(err.message))}</p>`;
      const loadingEl = hero.querySelector('.report-loading');
      if (loadingEl) loadingEl.remove();
    });

  return container;
}
