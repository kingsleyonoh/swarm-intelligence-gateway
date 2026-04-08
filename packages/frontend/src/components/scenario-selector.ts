/**
 * Scenario Selector Component
 *
 * Dropdown + "Run Swarm Analysis" button for launching pre-built
 * geopolitical scenarios. Renders into the provided container
 * and calls onLaunch(templateId) when the user clicks the button.
 */

export interface ScenarioOption {
  id: string;
  label: string;
  category: string;
}

export interface ScenarioSelectorController {
  setOptions(options: ScenarioOption[]): void;
  setLoading(loading: boolean): void;
  /** Block launches while a simulation is already active */
  setSimulationActive(active: boolean): void;
  destroy(): void;
}

const CATEGORY_PREFIX: Record<string, string> = {
  live: '[LIVE]',
  military: '[MILITARY]',
  market: '[MARKET]',
  cyber: '[CYBER]',
  political: '[POLITICAL]',
};

/**
 * Create a scenario selector with dropdown and launch button.
 *
 * @param container - DOM element to mount into
 * @param onLaunch  - callback fired with the selected templateId
 */
export function createScenarioSelector(
  container: HTMLElement,
  onLaunch: (templateId: string) => void,
): ScenarioSelectorController {
  const root = document.createElement('div');
  root.className = 'scenario-selector';

  const select = document.createElement('select');
  select.className = 'scenario-select';
  addPlaceholder(select);

  const btn = document.createElement('button');
  btn.className = 'analyze-btn';
  btn.textContent = 'Run Swarm Analysis';
  btn.disabled = true;

  root.appendChild(select);
  root.appendChild(btn);
  container.appendChild(root);

  // ── Event wiring ──────────────────────────────────────────────────

  let isLoading = false;
  let simActive = false;

  function updateButton(): void {
    if (isLoading) return;
    if (simActive) {
      btn.textContent = 'Simulation in progress...';
      btn.disabled = true;
      btn.classList.add('analyze-btn--running');
    } else {
      btn.textContent = 'Run Swarm Analysis';
      btn.disabled = select.value === '';
      btn.classList.remove('analyze-btn--running');
    }
  }

  select.addEventListener('change', () => updateButton());

  btn.addEventListener('click', () => {
    if (btn.disabled || select.value === '' || simActive) return;
    onLaunch(select.value);
  });

  // ── Controller ────────────────────────────────────────────────────

  return {
    setOptions(options: ScenarioOption[]): void {
      // Clear existing options
      select.innerHTML = '';
      addPlaceholder(select);

      for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt.id;
        const prefix = CATEGORY_PREFIX[opt.category] ?? '';
        el.textContent = prefix ? `${prefix} ${opt.label}` : opt.label;
        select.appendChild(el);
      }

      // Reset selection and button
      select.value = '';
      if (!isLoading) {
        btn.disabled = true;
      }
    },

    setLoading(loading: boolean): void {
      isLoading = loading;
      if (loading) {
        btn.textContent = 'Launching...';
        btn.disabled = true;
        select.disabled = true;
      } else {
        select.disabled = false;
        updateButton();
      }
    },

    setSimulationActive(active: boolean): void {
      simActive = active;
      updateButton();
    },

    destroy(): void {
      root.remove();
    },
  };
}

function addPlaceholder(select: HTMLSelectElement): void {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a scenario to analyze...';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);
}
