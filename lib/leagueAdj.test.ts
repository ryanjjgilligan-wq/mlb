import { describe, it, expect } from 'vitest';
import { wRCPlus, opsPlus, eraMinus } from './leagueAdj';

const lg = {
  lgWOBA: 0.310,
  lgOBP: 0.320,
  lgSLG: 0.410,
  lgERA: 4.30,
  runsPerPA: 0.117,
  wOBAScale: 1.157,
};

describe('wRC+', () => {
  it('league-average hitter ≈ 100', () => {
    // Build a stat that produces wOBA = lgWOBA exactly. Easiest: zero ABs but
    // we'll use a balanced line that yields ~ .310 wOBA via the static weights.
    const stat = {
      atBats: 500,
      hits: 130,
      doubles: 25,
      triples: 3,
      homeRuns: 12,
      baseOnBalls: 50,
      hitByPitch: 5,
      sacFlies: 3,
      strikeOuts: 110,
      plateAppearances: 558,
    };
    const v = wRCPlus(stat, lg);
    expect(v).toBeGreaterThan(80);
    expect(v).toBeLessThan(125);
  });
  it('elite hitter > 140', () => {
    // Trout 2018-style line
    const stat = {
      atBats: 471,
      hits: 147,
      doubles: 24,
      triples: 4,
      homeRuns: 39,
      baseOnBalls: 122,
      hitByPitch: 10,
      sacFlies: 6,
      strikeOuts: 124,
      plateAppearances: 608,
    };
    expect(wRCPlus(stat, lg)).toBeGreaterThan(140);
  });
  it('weak hitter < 80', () => {
    const stat = {
      atBats: 400,
      hits: 80,
      doubles: 10,
      triples: 0,
      homeRuns: 5,
      baseOnBalls: 25,
      hitByPitch: 1,
      sacFlies: 2,
      strikeOuts: 130,
      plateAppearances: 428,
    };
    expect(wRCPlus(stat, lg)).toBeLessThan(80);
  });
});

describe('OPS+', () => {
  it('league-average ≈ 100', () => {
    const stat = {
      atBats: 500, hits: 130, doubles: 25, triples: 3, homeRuns: 12,
      baseOnBalls: 50, hitByPitch: 5, sacFlies: 3,
    };
    const v = opsPlus(stat, lg);
    expect(v).toBeGreaterThan(85);
    expect(v).toBeLessThan(125);
  });
});

describe('ERA-', () => {
  it('league-avg ERA → 100', () => {
    expect(eraMinus(4.30, lg)).toBeCloseTo(100, 0);
  });
  it('Cy Young 2.50 ERA → ~58', () => {
    expect(eraMinus(2.50, lg)).toBeCloseTo(58, 0);
  });
  it('Pitcher-friendly park penalty (factor 90)', () => {
    // ERA- should INCREASE (worse) when normalized in a pitcher park
    const neutral = eraMinus(3.00, lg);
    const withPark = eraMinus(3.00, lg, 90);
    expect(withPark).toBeGreaterThan(neutral);
  });
});
