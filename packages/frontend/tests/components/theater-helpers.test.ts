import { describe, it, expect } from 'vitest';
import { createSimulationPulse } from '../../src/components/theater-helpers.js';

describe('createSimulationPulse', () => {
  it('returns element with pulse dot and "SIMULATING..." text for simulating status', () => {
    const el = createSimulationPulse('simulating');
    expect(el).not.toBeNull();
    expect(el!.className).toBe('sim-pulse-indicator');

    const dot = el!.querySelector('.sim-pulse-dot');
    expect(dot).not.toBeNull();

    const text = el!.querySelector('.sim-pulse-text');
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe('SIMULATING...');
  });

  it('returns element with "BUILDING GRAPH..." text for graph_building status', () => {
    const el = createSimulationPulse('graph_building');
    expect(el).not.toBeNull();

    const text = el!.querySelector('.sim-pulse-text');
    expect(text!.textContent).toBe('BUILDING GRAPH...');
  });

  it('returns element with "QUEUED..." text for pending status', () => {
    const el = createSimulationPulse('pending');
    expect(el).not.toBeNull();

    const text = el!.querySelector('.sim-pulse-text');
    expect(text!.textContent).toBe('QUEUED...');
  });

  it('returns element with "QUEUED..." text for queued status', () => {
    const el = createSimulationPulse('queued');
    expect(el).not.toBeNull();

    const text = el!.querySelector('.sim-pulse-text');
    expect(text!.textContent).toBe('QUEUED...');
  });

  it('returns element with "GENERATING REPORT..." text for reporting status', () => {
    const el = createSimulationPulse('reporting');
    expect(el).not.toBeNull();

    const text = el!.querySelector('.sim-pulse-text');
    expect(text!.textContent).toBe('GENERATING REPORT...');
  });

  it('returns null for completed status', () => {
    const el = createSimulationPulse('completed');
    expect(el).toBeNull();
  });

  it('returns null for failed status', () => {
    const el = createSimulationPulse('failed');
    expect(el).toBeNull();
  });

  it('returns null for cancelled status', () => {
    const el = createSimulationPulse('cancelled');
    expect(el).toBeNull();
  });

  it('returns null for undefined status', () => {
    const el = createSimulationPulse(undefined);
    expect(el).toBeNull();
  });
});
