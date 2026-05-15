import { describe, it, expect } from 'vitest';
import { rateFromSeason, simulateLineup, optimizeLineup, type BatterRates } from './markov';

const avg: BatterRates = { pBB: 0.085, pK: 0.22, pHR: 0.025, p3B: 0.005, p2B: 0.045, p1B: 0.13, pOut: 0.49 };
const elite: BatterRates = { pBB: 0.14, pK: 0.18, pHR: 0.05, p3B: 0.005, p2B: 0.06, p1B: 0.18, pOut: 0.385 };
const weak: BatterRates = { pBB: 0.05, pK: 0.30, pHR: 0.01, p3B: 0.003, p2B: 0.03, p1B: 0.10, pOut: 0.507 };

describe('Markov sim', () => {
  it('avg lineup ≈ 4-5 runs/game (MLB-ish)', () => {
    const lineup = Array(9).fill(avg) as BatterRates[];
    const r = simulateLineup(lineup, 2000);
    expect(r.meanRunsPerGame).toBeGreaterThan(3.5);
    expect(r.meanRunsPerGame).toBeLessThan(6.0);
  });
  it('elite lineup outscores weak lineup', () => {
    const e = simulateLineup(Array(9).fill(elite) as BatterRates[], 2000);
    const w = simulateLineup(Array(9).fill(weak) as BatterRates[], 2000);
    expect(e.meanRunsPerGame).toBeGreaterThan(w.meanRunsPerGame);
  });
  it('CI80 brackets the mean', () => {
    const r = simulateLineup(Array(9).fill(avg) as BatterRates[], 2000);
    expect(r.ci80.low).toBeLessThanOrEqual(r.meanRunsPerGame);
    expect(r.ci80.high).toBeGreaterThanOrEqual(r.meanRunsPerGame);
  });
  it('rateFromSeason — empty input falls back to league averages', () => {
    const r = rateFromSeason({});
    const sum = r.pBB + r.pK + r.pHR + r.p3B + r.p2B + r.p1B + r.pOut;
    expect(sum).toBeCloseTo(1, 1);
  });
  it('rateFromSeason — Trout 2012 produces sensible rates', () => {
    const r = rateFromSeason({
      atBats: 559, hits: 182, doubles: 27, triples: 8, homeRuns: 30,
      baseOnBalls: 67, hitByPitch: 6, sacFlies: 6, strikeOuts: 139,
      plateAppearances: 639,
    });
    expect(r.pBB).toBeGreaterThan(0.10);
    expect(r.pHR).toBeGreaterThan(0.04);
    expect(r.pK).toBeGreaterThan(0.18);
    expect(r.pK).toBeLessThan(0.25);
  });
});

describe('Lineup optimizer', () => {
  it('returns a valid 9-batter ordering', () => {
    const batters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => ({ id, name: id, rates: avg }));
    const r = optimizeLineup(batters, 200, 5);
    expect(r.bestOrder.length).toBe(9);
    const ids = new Set(r.bestOrder.map((b) => b.id));
    expect(ids.size).toBe(9);
  });
});
