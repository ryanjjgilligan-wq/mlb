import { describe, it, expect } from 'vitest';
import { blendStats, recencyWeightedFIP, recencyWeightedRPG } from './recency';

describe('blendStats', () => {
  it('returns empty when all inputs null', () => {
    expect(blendStats(null, null, null)).toEqual({});
  });

  it('falls back to season when only season provided', () => {
    const out = blendStats(null, null, { runs: 100, gamesPlayed: 50 });
    expect(out.runs).toBe(100);
    expect(out.gamesPlayed).toBe(50);
  });

  it('weights recent over season when both present', () => {
    // recent: hot streak (200 R / 30 G = 6.67/G); season: cooler (300 R / 100 G = 3/G)
    // default weights recent=0.5, season=0.2 — when only two present, normalized:
    //   recent → 0.5/(0.5+0.2) = 0.714
    //   season → 0.2/(0.5+0.2) = 0.286
    // expected runs = 0.714*200 + 0.286*300 = 142.86 + 85.71 = 228.57
    const out = blendStats(
      { runs: 200, gamesPlayed: 30 },
      null,
      { runs: 300, gamesPlayed: 100 }
    );
    expect(out.runs as number).toBeGreaterThan(220);
    expect(out.runs as number).toBeLessThan(240);
  });

  it('innings pitched parses thirds correctly when blended', () => {
    // 200.0 IP at 50% weight + 100.0 IP at 50% weight = 150.0
    const out = blendStats(
      { inningsPitched: '200.0', strikeOuts: 200 },
      null,
      { inningsPitched: '100.0', strikeOuts: 100 },
      { recent: 0.5, mid: 0, season: 0.5 }
    );
    expect(parseFloat(String(out.inningsPitched))).toBeCloseTo(150, 1);
  });

  it('non-numeric values take from most-recent source', () => {
    const out = blendStats(
      { teamName: 'recent name' },
      null,
      { teamName: 'season name' }
    );
    expect(out.teamName).toBe('recent name');
  });
});

describe('recencyWeightedFIP', () => {
  it('hot recent FIP pulls projection lower than season alone', () => {
    // Recent: ace-level
    const recent = {
      inningsPitched: '25.0',
      strikeOuts: 35,
      baseOnBalls: 5,
      hitByPitch: 1,
      homeRuns: 1,
      gamesStarted: 4,
      gamesPlayed: 4,
    };
    // Season: bigger sample, mediocre
    const season = {
      inningsPitched: '120.0',
      strikeOuts: 110,
      baseOnBalls: 50,
      hitByPitch: 4,
      homeRuns: 18,
      gamesStarted: 22,
      gamesPlayed: 22,
    };
    const blended = recencyWeightedFIP(recent, null, season);
    const seasonFIP = recencyWeightedFIP(null, null, season).fip!;
    expect(blended.fip).toBeLessThan(seasonFIP);
    expect(blended.ipPerStart).toBeGreaterThan(2);
    expect(blended.sources.length).toBe(2);
  });
  it('returns null FIP when no inputs', () => {
    expect(recencyWeightedFIP(null, null, null).fip).toBeNull();
  });
});

describe('recencyWeightedRPG', () => {
  it('blends correctly', () => {
    const r = recencyWeightedRPG(
      { runs: 90, gamesPlayed: 15 }, // 6.0 R/G
      null,
      { runs: 200, gamesPlayed: 50 } // 4.0 R/G
    );
    // recent weight 0.5, season weight 0.2 → renormalized 0.714 / 0.286
    // blended runs ≈ 0.714*90 + 0.286*200 = 64.29 + 57.14 = 121.43
    // blended games ≈ 0.714*15 + 0.286*50 = 10.71 + 14.29 = 25
    // → 121.43 / 25 = 4.86 R/G
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(4.5);
    expect(r!).toBeLessThan(5.2);
  });
});
