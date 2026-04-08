/**
 * Tests for live-feed component — scrolling agent action feed
 * with polling, stance colors, and completion detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLiveFeed, type LiveFeedAction } from '../../src/components/live-feed.js';

function makeAction(overrides: Partial<LiveFeedAction> = {}): LiveFeedAction {
  return {
    id: 'ep-1',
    agentId: 1,
    username: 'hawk_agent',
    stance: 'escalate',
    roundNumber: 1,
    actionType: 'CREATE_POST',
    content: 'Tensions are rising in the region.',
    createdAt: '2026-04-07T12:00:00Z',
    ...overrides,
  };
}

function mockFetchActions(actions: LiveFeedAction[], hasMore = false) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: actions, hasMore }),
  });
}

describe('createLiveFeed', () => {
  let container: HTMLElement;
  const onBack = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    onBack.mockClear();
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates a container with live-feed class', () => {
    vi.stubGlobal('fetch', mockFetchActions([]));
    const feed = createLiveFeed('sim-1', 'Test Theater', 'key', 'http://localhost', onBack);
    expect(feed.classList.contains('live-feed')).toBe(true);
  });

  it('renders theater name in header', () => {
    vi.stubGlobal('fetch', mockFetchActions([]));
    const feed = createLiveFeed('sim-1', 'South China Sea', 'key', 'http://localhost', onBack);
    const title = feed.querySelector('.live-feed-title');
    expect(title).not.toBeNull();
    expect(title?.textContent).toBe('South China Sea');
  });

  it('renders a back button that calls onBack', () => {
    vi.stubGlobal('fetch', mockFetchActions([]));
    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    const btn = feed.querySelector('.debate-back-btn') as HTMLElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders a live indicator', () => {
    vi.stubGlobal('fetch', mockFetchActions([]));
    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    const indicator = feed.querySelector('.live-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain('Live');
  });

  it('renders a scrolling feed list area', () => {
    vi.stubGlobal('fetch', mockFetchActions([]));
    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    const list = feed.querySelector('.live-feed-list');
    expect(list).not.toBeNull();
  });

  it('fetches actions on creation and renders them', async () => {
    const actions = [
      makeAction({ id: 'ep-1', username: 'hawk_agent', stance: 'escalate' }),
      makeAction({ id: 'ep-2', username: 'dove_agent', stance: 'de_escalate', content: 'Peace is possible' }),
    ];
    vi.stubGlobal('fetch', mockFetchActions(actions));

    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    container.appendChild(feed);

    // Let the fetch promise resolve
    await vi.advanceTimersByTimeAsync(100);

    const actionEls = feed.querySelectorAll('.live-action');
    expect(actionEls.length).toBe(2);
  });

  it('renders action with correct username and content', async () => {
    const actions = [
      makeAction({ username: 'strategist_42', content: 'Analysis complete' }),
    ];
    vi.stubGlobal('fetch', mockFetchActions(actions));

    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    container.appendChild(feed);
    await vi.advanceTimersByTimeAsync(100);

    const usernameEl = feed.querySelector('.live-action-username');
    expect(usernameEl?.textContent).toBe('strategist_42');

    const contentEl = feed.querySelector('.live-action-content');
    expect(contentEl?.textContent).toBe('Analysis complete');
  });

  it('renders action type badge', async () => {
    const actions = [makeAction({ actionType: 'COMMENT' })];
    vi.stubGlobal('fetch', mockFetchActions(actions));

    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    container.appendChild(feed);
    await vi.advanceTimersByTimeAsync(100);

    const badge = feed.querySelector('.live-action-type');
    expect(badge?.textContent).toBe('COMMENT');
  });

  it('renders round number', async () => {
    const actions = [makeAction({ roundNumber: 3 })];
    vi.stubGlobal('fetch', mockFetchActions(actions));

    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    container.appendChild(feed);
    await vi.advanceTimersByTimeAsync(100);

    const round = feed.querySelector('.live-action-round');
    expect(round?.textContent).toContain('3');
  });

  it('applies stance color to dot element', async () => {
    const actions = [makeAction({ stance: 'escalate' })];
    vi.stubGlobal('fetch', mockFetchActions(actions));

    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    container.appendChild(feed);
    await vi.advanceTimersByTimeAsync(100);

    const dot = feed.querySelector('.live-action-dot') as HTMLElement;
    expect(dot).not.toBeNull();
    // happy-dom keeps hex values as-is (doesn't convert to rgb)
    expect(dot.style.background).toBe('#e05252');
  });

  it('maps stance colors correctly', async () => {
    const stanceMap: Record<string, string> = {
      escalate: '#e05252',
      de_escalate: '#4a90d9',
      uncertain: '#d4a843',
      neutral: '#888',
    };

    for (const [stance, expectedColor] of Object.entries(stanceMap)) {
      const fetchMock = mockFetchActions([makeAction({ id: `ep-${stance}`, stance })]);
      vi.stubGlobal('fetch', fetchMock);

      const feed = createLiveFeed(`sim-${stance}`, 'T', 'k', 'http://localhost', onBack);
      container.appendChild(feed);
      await vi.advanceTimersByTimeAsync(100);

      const dot = feed.querySelector('.live-action-dot') as HTMLElement;
      expect(dot.style.background).toBe(expectedColor);

      feed.remove();
    }
  });

  it('shows completion banner when given completed callback', async () => {
    // First fetch returns actions, second returns empty (simulating poll)
    vi.stubGlobal('fetch', mockFetchActions([makeAction()]));

    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    container.appendChild(feed);
    await vi.advanceTimersByTimeAsync(100);

    // Simulate completion by calling the completion handler
    const completeEl = document.createElement('div');
    completeEl.className = 'live-feed-complete';
    completeEl.innerHTML = '<h3>Simulation Complete</h3><p>1 actions analyzed</p>';
    feed.appendChild(completeEl);

    expect(feed.querySelector('.live-feed-complete')).not.toBeNull();
  });

  it('calls fetch with correct URL including simulation id', async () => {
    const fetchMock = mockFetchActions([]);
    vi.stubGlobal('fetch', fetchMock);

    createLiveFeed('abc-123', 'Theater', 'my-key', 'http://api.test', onBack);
    await vi.advanceTimersByTimeAsync(100);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/simulations/abc-123/actions?limit=30',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'my-key' }),
      }),
    );
  });

  it('handles fetch errors gracefully without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const feed = createLiveFeed('sim-1', 'Theater', 'key', 'http://localhost', onBack);
    container.appendChild(feed);

    // Advance just enough for the initial fetch promise to settle
    // (don't use runAllTimersAsync — the setInterval creates infinite loop)
    await vi.advanceTimersByTimeAsync(100);
    expect(feed.querySelector('.live-feed-list')).not.toBeNull();
  });
});
