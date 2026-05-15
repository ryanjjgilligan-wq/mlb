/**
 * Monte Carlo playoff odds simulator.
 *
 * Inputs:
 *   - Current standings (all teams' wins/losses/runs)
 *   - Remaining schedule for the team of interest (and others if available)
 *
 * Method (simple but defensible):
 *   - Each remaining game between A and B: compute win prob for A using Log5
 *     on each team's Pythagorean expected W%, with a 0.54 HFA bump applied
 *     via the odds ratio at the home club.
 *   - Sample the binary outcome.
 *   - Tally final wins for each club. Re-rank divisions + wild cards.
 *   - Repeat N times.
 *
 * Limitations (called out on /lab):
 *   - Doesn't model rotations, bullpen state, injuries, weather.
 *   - Pythagorean as the talent estimator gets noisy with small samples early
 *     in the season — the result inherits that noise.
 *   - This sim only iterates the focal team's remaining schedule against fixed
 *     opponent records to keep it cheap. The "true" Baseball-Reference style
 *     sim would re-simulate every league game; we'd need full league
 *     remaining-schedule for that.
 */

import { pythagorean } from './saber';
import { log5 } from './winprob';

export type SimTeam = {
  id: number;
  name: string;
  wins: number;
  losses: number;
  pyth: number; // 0-1
};

export type SimGame = {
  homeId: number;
  awayId: number;
};

const HFA = 0.54;

function applyHFA(p: number): number {
  // Apply home-field via odds ratio
  const odds = (p / Math.max(1e-9, 1 - p)) * (HFA / (1 - HFA));
  return odds / (1 + odds);
}

export function simulateOne(
  teams: Map<number, SimTeam>,
  games: SimGame[],
  rng: () => number
): Map<number, number> {
  // wins delta
  const delta = new Map<number, number>();
  for (const g of games) {
    const home = teams.get(g.homeId);
    const away = teams.get(g.awayId);
    if (!home || !away) continue;
    const baseHomeWP = log5(home.pyth, away.pyth);
    const hwp = applyHFA(baseHomeWP);
    const homeWins = rng() < hwp;
    if (homeWins) {
      delta.set(home.id, (delta.get(home.id) ?? 0) + 1);
    } else {
      delta.set(away.id, (delta.get(away.id) ?? 0) + 1);
    }
  }
  return delta;
}

export function runMonteCarlo(
  focalTeamId: number,
  teams: SimTeam[],
  focalRemainingSchedule: SimGame[],
  iterations: number = 5000,
  seed: number = 42
): {
  expectedWins: number;
  expectedLosses: number;
  winDistribution: { wins: number; freq: number }[];
  iterationsRun: number;
} {
  const teamsMap = new Map(teams.map((t) => [t.id, t]));
  const focal = teamsMap.get(focalTeamId);
  if (!focal) {
    return { expectedWins: 0, expectedLosses: 0, winDistribution: [], iterationsRun: 0 };
  }

  const rng = mulberry32(seed);
  const winCounts: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const delta = simulateOne(teamsMap, focalRemainingSchedule, rng);
    winCounts.push(focal.wins + (delta.get(focalTeamId) ?? 0));
  }

  const expectedWins = winCounts.reduce((a, b) => a + b, 0) / iterations;
  const totalGames = focal.wins + focal.losses + focalRemainingSchedule.length;
  const expectedLosses = totalGames - expectedWins;

  // Histogram
  const histogram = new Map<number, number>();
  for (const w of winCounts) histogram.set(w, (histogram.get(w) ?? 0) + 1);
  const winDistribution = [...histogram.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wins, count]) => ({ wins, freq: count / iterations }));

  return { expectedWins, expectedLosses, winDistribution, iterationsRun: iterations };
}

// Seeded RNG so simulations are deterministic per render
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
