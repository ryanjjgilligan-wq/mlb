/**
 * Unit tests for sabermetric calculations.
 * Reference values verified against Fangraphs / Baseball-Reference for known
 * historical seasons.
 */
import { describe, it, expect } from 'vitest';
import {
  obp,
  slg,
  iso,
  babip,
  woba,
  fip,
  whip,
  k9,
  parseInnings,
  pythagorean,
  fmtAvg,
} from './saber';

describe('hitting metrics — Mike Trout 2012 (rookie MVP season)', () => {
  // Verified against baseball-reference.com
  const trout2012 = {
    atBats: 559,
    hits: 182,
    doubles: 27,
    triples: 8,
    homeRuns: 30,
    baseOnBalls: 67,
    intentionalWalks: 11,
    hitByPitch: 6,
    sacFlies: 6,
    strikeOuts: 139,
    plateAppearances: 639,
  };
  it('OBP ≈ .399', () => {
    expect(obp(trout2012)).toBeCloseTo(0.399, 2);
  });
  it('SLG ≈ .564', () => {
    expect(slg(trout2012)).toBeCloseTo(0.564, 2);
  });
  it('ISO ≈ .238', () => {
    expect(iso(trout2012)).toBeCloseTo(0.238, 2);
  });
});

describe('BABIP — verify edge cases', () => {
  it('returns 0 for zero balls in play', () => {
    expect(babip({ hits: 0, homeRuns: 0, atBats: 0, strikeOuts: 0, sacFlies: 0 })).toBe(0);
  });
  it('Mookie Betts 2018 ≈ .368', () => {
    expect(
      babip({ hits: 180, homeRuns: 32, atBats: 520, strikeOuts: 91, sacFlies: 1 })
    ).toBeCloseTo(0.368, 2);
  });
});

describe('wOBA — sanity', () => {
  it('All-zeros input → 0', () => {
    expect(woba({})).toBe(0);
  });
  it('Pure singles hitter scales monotonically', () => {
    const lo = woba({ atBats: 100, hits: 20, baseOnBalls: 0, hitByPitch: 0, sacFlies: 0 });
    const hi = woba({ atBats: 100, hits: 40, baseOnBalls: 0, hitByPitch: 0, sacFlies: 0 });
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('innings parsing', () => {
  it('"121.1" = 121 + 1/3', () => {
    expect(parseInnings('121.1')).toBeCloseTo(121.333, 3);
  });
  it('"121.2" = 121 + 2/3', () => {
    expect(parseInnings('121.2')).toBeCloseTo(121.667, 3);
  });
  it('integer string', () => {
    expect(parseInnings('200')).toBe(200);
  });
  it('handles undefined', () => {
    expect(parseInnings(undefined)).toBe(0);
  });
});

describe('pitching metrics — Jacob deGrom 2018 (Cy Young)', () => {
  // Verified against baseball-reference.com
  const degrom = {
    inningsPitched: '217.0',
    strikeOuts: 269,
    baseOnBalls: 46,
    hits: 152,
    homeRuns: 10,
    hitByPitch: 11,
  };
  it('WHIP ≈ 0.912', () => {
    expect(whip(degrom)).toBeCloseTo(0.912, 2);
  });
  it('K/9 ≈ 11.16', () => {
    expect(k9(degrom)).toBeCloseTo(11.16, 1);
  });
  it('FIP — in low-2s range (Cy Young pitcher)', () => {
    // Actual published FIP was 1.99 using the league-specific 2018 constant
    // (3.16). Our static 3.10 should give ~1.93 — within 0.1.
    expect(fip(degrom)).toBeGreaterThan(1.7);
    expect(fip(degrom)).toBeLessThan(2.2);
  });
});

describe('Pythagorean expected W%', () => {
  it('Equal RS/RA → .500', () => {
    expect(pythagorean(700, 700)).toBeCloseTo(0.5, 5);
  });
  it('2001 Mariners (927 RS / 627 RA) with classic exp=2 → ~.686', () => {
    expect(pythagorean(927, 627, 2)).toBeCloseTo(0.686, 2);
  });
  it('2001 Mariners with exp=1.83 → ~.672 (closer to actual .716 than classic)', () => {
    expect(pythagorean(927, 627, 1.83)).toBeCloseTo(0.672, 2);
  });
});

describe('formatters', () => {
  it('.000 for zero', () => expect(fmtAvg(0)).toBe('.000'));
  it('strips leading zero', () => expect(fmtAvg(0.327)).toBe('.327'));
});
