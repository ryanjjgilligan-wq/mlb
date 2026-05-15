import { describe, it, expect } from 'vitest';
import { predictRunTotal, predictBatterProp, predictPitcherProp } from './predict';
import { NEUTRAL_PARK, getPark, haversineMiles, PARKS } from './parks';

describe('predictRunTotal — neutral inputs', () => {
  const base = {
    home: { teamId: 1, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    away: { teamId: 2, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    park: NEUTRAL_PARK,
  };
  it('neutral teams in a neutral park → ~9 total', () => {
    const r = predictRunTotal(base);
    expect(r.expectedTotal).toBeGreaterThan(8.5);
    expect(r.expectedTotal).toBeLessThan(9.5);
  });
  it('pHomeWin ≈ 0.5 when teams identical and no HFA', () => {
    const r = predictRunTotal(base);
    expect(r.pHomeWin).toBeGreaterThan(0.45);
    expect(r.pHomeWin).toBeLessThan(0.55);
  });
});

describe('predictRunTotal — park amplification', () => {
  const base = {
    home: { teamId: 1, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    away: { teamId: 2, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
  };
  it('Coors lifts total above 10', () => {
    const r = predictRunTotal({ ...base, park: PARKS[2680]! });
    expect(r.expectedTotal).toBeGreaterThan(10);
  });
  it('Petco lowers total below 9', () => {
    const r = predictRunTotal({ ...base, park: PARKS[20]! });
    expect(r.expectedTotal).toBeLessThan(9);
  });
});

describe('predictRunTotal — weather', () => {
  const base = {
    home: { teamId: 1, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    away: { teamId: 2, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    park: NEUTRAL_PARK,
  };
  it('warm + wind out = higher total than neutral', () => {
    const cold = predictRunTotal({ ...base, weather: { tempF: 70, windSpeedMph: 0, condition: 'Clear' } });
    const hot = predictRunTotal({ ...base, weather: { tempF: 95, windSpeedMph: 15, windDir: 'Out To CF', condition: 'Clear' } });
    expect(hot.expectedTotal).toBeGreaterThan(cold.expectedTotal);
  });
  it('cold + wind in = lower total', () => {
    const cold = predictRunTotal({ ...base, weather: { tempF: 45, windSpeedMph: 15, windDir: 'In From CF', condition: 'Clear' } });
    const neutral = predictRunTotal({ ...base, weather: { tempF: 70, windSpeedMph: 0, condition: 'Clear' } });
    expect(cold.expectedTotal).toBeLessThan(neutral.expectedTotal);
  });
  it('precip drops total ~2%', () => {
    const dry = predictRunTotal({ ...base, weather: { tempF: 70, condition: 'Clear' } });
    const wet = predictRunTotal({ ...base, weather: { tempF: 70, condition: 'Rain' } });
    expect(wet.expectedTotal).toBeLessThan(dry.expectedTotal * 0.99);
  });
});

describe('predictRunTotal — confidence intervals contain mean and widen with λ', () => {
  const base = {
    home: { teamId: 1, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    away: { teamId: 2, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    park: NEUTRAL_PARK,
  };
  it('80 CI strictly inside 95 CI', () => {
    const r = predictRunTotal(base);
    expect(r.ci80.low).toBeGreaterThanOrEqual(r.ci95.low);
    expect(r.ci80.high).toBeLessThanOrEqual(r.ci95.high);
  });
  it('Coors interval wider than Petco', () => {
    const coors = predictRunTotal({ ...base, park: PARKS[2680]! });
    const petco = predictRunTotal({ ...base, park: PARKS[20]! });
    expect(coors.ci95.high - coors.ci95.low).toBeGreaterThan(petco.ci95.high - petco.ci95.low);
  });
});

describe('predictBatterProp', () => {
  it('higher AVG → more hits', () => {
    const lo = predictBatterProp({ pa: 4, avg: 0.220, obp: 0.290, slg: 0.380 });
    const hi = predictBatterProp({ pa: 4, avg: 0.330, obp: 0.400, slg: 0.560 });
    expect(hi.expectedHits).toBeGreaterThan(lo.expectedHits);
    expect(hi.pHit1Plus).toBeGreaterThan(lo.pHit1Plus);
  });
  it('park HR factor scales HR probability', () => {
    const neutral = predictBatterProp({ pa: 4, avg: 0.260, obp: 0.330, slg: 0.450, homeRunRate: 0.04, parkHrFactor: 100 });
    const coors = predictBatterProp({ pa: 4, avg: 0.260, obp: 0.330, slg: 0.450, homeRunRate: 0.04, parkHrFactor: 117 });
    expect(coors.pHrAtLeastOne).toBeGreaterThan(neutral.pHrAtLeastOne);
  });
});

describe('predictPitcherProp', () => {
  it('higher K/9 → more Ks', () => {
    const lo = predictPitcherProp({ oppKRate: 0.22, pitcherK9: 7, pitcherIpPerStart: 5.5 });
    const hi = predictPitcherProp({ oppKRate: 0.22, pitcherK9: 12, pitcherIpPerStart: 5.5 });
    expect(hi.expectedStrikeouts).toBeGreaterThan(lo.expectedStrikeouts);
    expect(hi.pSixPlus).toBeGreaterThan(lo.pSixPlus);
  });
  it('opp K% scales output', () => {
    const lo = predictPitcherProp({ oppKRate: 0.18, pitcherK9: 10, pitcherIpPerStart: 6 });
    const hi = predictPitcherProp({ oppKRate: 0.28, pitcherK9: 10, pitcherIpPerStart: 6 });
    expect(hi.expectedStrikeouts).toBeGreaterThan(lo.expectedStrikeouts);
  });
});

describe('haversine distance', () => {
  it('NYC ↔ LAX is ~2451 mi', () => {
    const d = haversineMiles({ lat: 40.6413, lon: -73.7781 }, { lat: 33.9416, lon: -118.4085 });
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2510);
  });
  it('Same point → 0', () => {
    expect(haversineMiles({ lat: 40, lon: -75 }, { lat: 40, lon: -75 })).toBe(0);
  });
});

describe('getPark fallback', () => {
  it('unknown venue → neutral', () => {
    expect(getPark(99999999).runs).toBe(100);
  });
  it('Coors known', () => {
    expect(getPark(2680).runs).toBeGreaterThan(110);
  });
});
