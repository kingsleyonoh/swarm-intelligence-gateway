import { describe, it, expect } from 'vitest';
import {
  createLiveProgress,
  formatElapsed,
} from '../../src/components/theater-helpers.js';

describe('createLiveProgress', () => {
  it('returns element with pulse dot and "QUEUED" label for pending status', () => {
    const el = createLiveProgress('pending');
    expect(el).not.toBeNull();
    expect(el!.className).toBe('live-progress');

    const dot = el!.querySelector('.sim-pulse-dot');
    expect(dot).not.toBeNull();

    const label = el!.querySelector('.live-progress-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('QUEUED');
  });

  it('returns element with "QUEUED" label for queued status', () => {
    const el = createLiveProgress('queued');
    expect(el).not.toBeNull();
    const label = el!.querySelector('.live-progress-label');
    expect(label!.textContent).toBe('QUEUED');
  });

  it('returns element with "BUILDING GRAPH" label for graph_building status', () => {
    const el = createLiveProgress('graph_building');
    expect(el).not.toBeNull();
    const label = el!.querySelector('.live-progress-label');
    expect(label!.textContent).toBe('BUILDING GRAPH');
  });

  it('returns element with "RUNNING SWARM" label for simulating status', () => {
    const el = createLiveProgress('simulating');
    expect(el).not.toBeNull();
    const label = el!.querySelector('.live-progress-label');
    expect(label!.textContent).toBe('RUNNING SWARM');
  });

  it('returns element with "GENERATING REPORT" label for reporting status', () => {
    const el = createLiveProgress('reporting');
    expect(el).not.toBeNull();
    const label = el!.querySelector('.live-progress-label');
    expect(label!.textContent).toBe('GENERATING REPORT');
  });

  it('returns null for completed status', () => {
    const el = createLiveProgress('completed');
    expect(el).toBeNull();
  });

  it('returns null for failed status', () => {
    const el = createLiveProgress('failed');
    expect(el).toBeNull();
  });

  it('returns null for cancelled status', () => {
    const el = createLiveProgress('cancelled');
    expect(el).toBeNull();
  });

  it('shows elapsed time when elapsedMs is provided', () => {
    const el = createLiveProgress('simulating', 65000); // 1m 5s
    expect(el).not.toBeNull();
    const time = el!.querySelector('.live-progress-time');
    expect(time).not.toBeNull();
    expect(time!.textContent).toBe('1m 5s');
  });

  it('does not show elapsed time when elapsedMs is 0', () => {
    const el = createLiveProgress('simulating', 0);
    expect(el).not.toBeNull();
    const time = el!.querySelector('.live-progress-time');
    expect(time).toBeNull();
  });

  it('does not show elapsed time when elapsedMs is undefined', () => {
    const el = createLiveProgress('simulating');
    expect(el).not.toBeNull();
    const time = el!.querySelector('.live-progress-time');
    expect(time).toBeNull();
  });

  it('shows progress bar for simulating status', () => {
    const el = createLiveProgress('simulating', 5000);
    expect(el).not.toBeNull();
    const bar = el!.querySelector('.live-progress-bar');
    expect(bar).not.toBeNull();
    const fill = bar!.querySelector('.live-progress-fill');
    expect(fill).not.toBeNull();
  });

  it('shows progress bar for graph_building status', () => {
    const el = createLiveProgress('graph_building', 5000);
    expect(el).not.toBeNull();
    const bar = el!.querySelector('.live-progress-bar');
    expect(bar).not.toBeNull();
  });

  it('shows progress bar for reporting status', () => {
    const el = createLiveProgress('reporting', 5000);
    expect(el).not.toBeNull();
    const bar = el!.querySelector('.live-progress-bar');
    expect(bar).not.toBeNull();
  });

  it('does not show progress bar for pending status', () => {
    const el = createLiveProgress('pending', 5000);
    expect(el).not.toBeNull();
    const bar = el!.querySelector('.live-progress-bar');
    expect(bar).toBeNull();
  });

  it('does not show progress bar for queued status', () => {
    const el = createLiveProgress('queued', 5000);
    expect(el).not.toBeNull();
    const bar = el!.querySelector('.live-progress-bar');
    expect(bar).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats sub-60 seconds as Ns', () => {
    expect(formatElapsed(5000)).toBe('5s');
    expect(formatElapsed(45000)).toBe('45s');
  });

  it('formats 0 milliseconds as 0s', () => {
    expect(formatElapsed(0)).toBe('0s');
  });

  it('formats exactly 60 seconds as 1m 0s', () => {
    expect(formatElapsed(60000)).toBe('1m 0s');
  });

  it('formats minutes with remainder seconds', () => {
    expect(formatElapsed(125000)).toBe('2m 5s');
  });

  it('formats large values correctly', () => {
    expect(formatElapsed(3661000)).toBe('61m 1s');
  });
});
