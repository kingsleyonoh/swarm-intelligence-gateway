/**
 * Report View — renders a full simulation report when a theater card is clicked.
 *
 * Fetches the report from GET /api/simulations/:id/report, converts simple
 * Markdown to HTML, and displays predictions as a structured summary.
 */

const PREDICTION_COLORS: Record<string, string> = {
  escalation: '#e05252',
  de_escalation: '#4a90d9',
  market_shift: '#d4a843',
  sentiment_cascade: '#9b59b6',
};

/** Convert simple Markdown subset to HTML (headings, blockquotes, bold, hr) */
function markdownToHtml(md: string): string {
  return md
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed === '---') return '<hr>';
      if (trimmed.startsWith('## ')) return `<h3>${esc(trimmed.slice(3))}</h3>`;
      if (trimmed.startsWith('# ')) return `<h2>${esc(trimmed.slice(2))}</h2>`;
      if (trimmed.startsWith('> ')) return `<blockquote>${esc(trimmed.slice(2))}</blockquote>`;
      return `<p>${boldify(esc(trimmed))}</p>`;
    })
    .filter(Boolean)
    .join('\n');
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

/** Fetch report from API via Vite proxy */
async function fetchReport(simId: string, apiKey: string, baseUrl: string): Promise<ReportData> {
  const base = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/simulations/${simId}/report`, {
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Report unavailable (${res.status})`);
  return res.json() as Promise<ReportData>;
}

/** Build the predictions summary section */
function buildPredictionsSummary(predictions: ReportPrediction[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'report-predictions';

  const heading = document.createElement('h3');
  heading.textContent = 'Extracted Predictions';
  section.appendChild(heading);

  for (const pred of predictions) {
    const card = document.createElement('div');
    card.className = 'report-prediction-card';

    const conf = typeof pred.confidence === 'string' ? parseFloat(pred.confidence) : pred.confidence;
    const color = PREDICTION_COLORS[pred.predictionType] ?? '#888';
    const typeLabel = pred.predictionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    card.innerHTML = `
      <div class="report-pred-header">
        <span class="report-pred-dot" style="background:${color}"></span>
        <span class="report-pred-type">${esc(typeLabel)}</span>
        <span class="report-pred-conf">${Math.round(conf * 100)}%</span>
        <span class="report-pred-horizon">${esc(pred.timeHorizon)}</span>
      </div>
      <p class="report-pred-summary">${esc(pred.summary)}</p>
    `;
    section.appendChild(card);
  }

  return section;
}

/** Create the full report view with back button, report content, and predictions */
export function createReportView(
  simId: string,
  theaterName: string,
  apiKey: string,
  baseUrl: string,
  onBack: () => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'report-view';

  const backBtn = document.createElement('button');
  backBtn.className = 'debate-back-btn';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', onBack);
  container.appendChild(backBtn);

  const header = document.createElement('div');
  header.className = 'report-header';
  header.innerHTML = `<h2>${esc(theaterName)}</h2><span class="report-loading">Loading report...</span>`;
  container.appendChild(header);

  const content = document.createElement('div');
  content.className = 'report-content';
  container.appendChild(content);

  // Fetch and render asynchronously
  fetchReport(simId, apiKey, baseUrl)
    .then((data) => {
      const loadingEl = header.querySelector('.report-loading');
      if (loadingEl) loadingEl.remove();

      // Render report markdown
      content.innerHTML = markdownToHtml(data.report);

      // Append predictions summary
      if (data.predictions.length > 0) {
        container.appendChild(buildPredictionsSummary(data.predictions));
      }
    })
    .catch((err) => {
      content.innerHTML = `<p class="report-error">Failed to load report: ${esc(String(err.message))}</p>`;
      const loadingEl = header.querySelector('.report-loading');
      if (loadingEl) loadingEl.remove();
    });

  return container;
}
