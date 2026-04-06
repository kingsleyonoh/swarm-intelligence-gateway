import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import type { SimulationRow, PredictionRow } from '../../src/api/types.js';

const DEMO_DIR = resolve(__dirname, '../../public/demo');

function readDemoJson<T>(filename: string): T {
  const raw = readFileSync(resolve(DEMO_DIR, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

describe('Demo data files', () => {
  describe('simulations.json', () => {
    it('exists and parses as valid JSON', () => {
      const data = readDemoJson<{
        data: SimulationRow[];
        nextCursor: string | null;
      }>('simulations.json');

      expect(data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('contains 3-5 completed simulations', () => {
      const data = readDemoJson<{
        data: SimulationRow[];
        nextCursor: string | null;
      }>('simulations.json');

      expect(data.data.length).toBeGreaterThanOrEqual(3);
      expect(data.data.length).toBeLessThanOrEqual(5);
    });

    it('each simulation has required fields', () => {
      const data = readDemoJson<{
        data: SimulationRow[];
        nextCursor: string | null;
      }>('simulations.json');

      for (const sim of data.data) {
        expect(sim.id).toBeTruthy();
        expect(sim.tenantId).toBeTruthy();
        expect(sim.scenarioId).toBeTruthy();
        expect(sim.status).toBe('completed');
        expect(sim.createdAt).toBeTruthy();
        expect(sim.updatedAt).toBeTruthy();
      }
    });
  });

  describe('predictions.json', () => {
    it('exists and parses as valid JSON', () => {
      const data = readDemoJson<{
        data: PredictionRow[];
        nextCursor: string | null;
      }>('predictions.json');

      expect(data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('contains 15-20 predictions', () => {
      const data = readDemoJson<{
        data: PredictionRow[];
        nextCursor: string | null;
      }>('predictions.json');

      expect(data.data.length).toBeGreaterThanOrEqual(15);
      expect(data.data.length).toBeLessThanOrEqual(20);
    });

    it('predictions have valid confidence values (0-1)', () => {
      const data = readDemoJson<{
        data: PredictionRow[];
        nextCursor: string | null;
      }>('predictions.json');

      for (const pred of data.data) {
        expect(pred.confidence).toBeGreaterThanOrEqual(0);
        expect(pred.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('predictions span multiple theaters', () => {
      const data = readDemoJson<{
        data: PredictionRow[];
        nextCursor: string | null;
      }>('predictions.json');

      const theaters = new Set(data.data.map((p) => p.theater));
      expect(theaters.size).toBeGreaterThanOrEqual(3);
    });

    it('predictions include varied types', () => {
      const data = readDemoJson<{
        data: PredictionRow[];
        nextCursor: string | null;
      }>('predictions.json');

      const types = new Set(data.data.map((p) => p.predictionType));
      expect(types.size).toBeGreaterThanOrEqual(3);
    });

    it('each prediction has required fields', () => {
      const data = readDemoJson<{
        data: PredictionRow[];
        nextCursor: string | null;
      }>('predictions.json');

      for (const pred of data.data) {
        expect(pred.id).toBeTruthy();
        expect(pred.simulationId).toBeTruthy();
        expect(pred.theater).toBeTruthy();
        expect(pred.predictionType).toBeTruthy();
        expect(pred.summary).toBeTruthy();
        expect(typeof pred.confidence).toBe('number');
        expect(pred.timeHorizon).toBeTruthy();
        expect(Array.isArray(pred.supportingFactions)).toBe(true);
        expect(Array.isArray(pred.dissentingFactions)).toBe(true);
        expect(pred.createdAt).toBeTruthy();
      }
    });
  });

  describe('report.json', () => {
    it('exists and parses as valid JSON', () => {
      const data = readDemoJson<{
        report: string;
        predictions: PredictionRow[];
        factions: unknown;
      }>('report.json');

      expect(data).toBeDefined();
      expect(typeof data.report).toBe('string');
    });

    it('contains a non-empty report string', () => {
      const data = readDemoJson<{
        report: string;
        predictions: PredictionRow[];
      }>('report.json');

      expect(data.report.length).toBeGreaterThan(50);
    });

    it('contains faction data with stance distributions', () => {
      const data = readDemoJson<{
        report: string;
        factions: Array<{
          region: string;
          stance: string;
          factionName: string;
          confidence: number;
        }>;
      }>('report.json');

      expect(Array.isArray(data.factions)).toBe(true);
      expect(data.factions.length).toBeGreaterThanOrEqual(3);

      for (const faction of data.factions) {
        expect(faction.region).toBeTruthy();
        expect(faction.stance).toBeTruthy();
        expect(faction.factionName).toBeTruthy();
        expect(typeof faction.confidence).toBe('number');
      }
    });
  });
});
