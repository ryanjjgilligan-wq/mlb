/**
 * Markov-chain lineup expected runs simulator.
 *
 * State space: 24 base-out states (8 base configurations × 3 outs) plus the
 * absorbing 3-out (inning over) state.
 *
 * Each batter's per-PA event probabilities (BB, K, HR, 3B, 2B, 1B, in-play out)
 * are derived from their season stats. Given a batter at the plate, we
 * transition probabilistically to a new (state, runs scored).
 *
 * Base-running assumptions (canonical, deliberately simple):
 *   Walk: forces only — runner advances if directly forced, else stays.
 *   Single: 1B → 2B; runner from 2B scores; runner from 3B scores.
 *   Double: 1B → 3B; 2B & 3B score.
 *   Triple: all runners score; batter on 3B.
 *   HR: all runners + batter score; bases empty.
 *   Out (in play): runner from 3B scores 30% of time only when 1 out and 2B/3B occupied (sac fly), simplified to just no advancement in this baseline.
 *   K: no runner advancement.
 *
 * We compute expected runs per inning by simulating one full inning starting
 * from (bases empty, 0 outs) with the lineup rotating from leadoff. Then
 * expected runs per game = expected R/inning × 9 (with batting order
 * advancing across innings, which we approximate by rotating the leadoff
 * by the number of plate appearances consumed).
 *
 * For practical use we run N=200 simulated innings per starting batter
 * position and average. Cheap and deterministic enough.
 */

export type BatterRates = {
  pBB: number;
  pK: number;
  pHR: number;
  p3B: number;
  p2B: number;
  p1B: number;
  pOut: number; // in-play out (residual)
};

export function rateFromSeason(s: Record<string, any>): BatterRates {
  const pa = Number(s.plateAppearances) || 0;
  const ab = Number(s.atBats) || 0;
  if (pa === 0) {
    return { pBB: 0.085, pK: 0.22, pHR: 0.025, p3B: 0.005, p2B: 0.045, p1B: 0.13, pOut: 0.49 };
  }
  const bb = Number(s.baseOnBalls) || 0;
  const hbp = Number(s.hitByPitch) || 0;
  const k = Number(s.strikeOuts) || 0;
  const hr = Number(s.homeRuns) || 0;
  const t3 = Number(s.triples) || 0;
  const t2 = Number(s.doubles) || 0;
  const h = Number(s.hits) || 0;
  const t1 = Math.max(0, h - hr - t3 - t2);
  const out = Math.max(0, pa - (bb + hbp + k + hr + t3 + t2 + t1));

  return {
    pBB: (bb + hbp) / pa,
    pK: k / pa,
    pHR: hr / pa,
    p3B: t3 / pa,
    p2B: t2 / pa,
    p1B: t1 / pa,
    pOut: out / pa,
  };
}

type State = {
  // bases as bitmask: 1B=1, 2B=2, 3B=4
  bases: number;
  outs: number;
};

function transition(state: State, event: keyof BatterRates): { next: State; runs: number; ended: boolean } {
  let bases = state.bases;
  let outs = state.outs;
  let runs = 0;
  const has = (b: number) => (bases & b) !== 0;

  const setBases = (b1: boolean, b2: boolean, b3: boolean) =>
    (b1 ? 1 : 0) | (b2 ? 2 : 0) | (b3 ? 4 : 0);

  switch (event) {
    case 'pBB': {
      // Force only: runners advance only if directly forced
      const r1 = true; // batter to 1B
      const r2 = has(1) || has(2); // 2B if 1B already had runner
      const r3 = (has(1) && has(2)) || has(3);
      const r4 = has(1) && has(2) && has(3); // forced home
      if (r4) runs += 1;
      bases = setBases(r1, r2, r3);
      break;
    }
    case 'pK': {
      outs += 1;
      break;
    }
    case 'pOut': {
      outs += 1;
      // No runner advancement in this baseline
      break;
    }
    case 'p1B': {
      // Runners: 3B scores, 2B scores, 1B → 2B, batter → 1B
      if (has(4)) runs += 1;
      if (has(2)) runs += 1;
      const newR2 = has(1);
      bases = setBases(true, newR2, false);
      break;
    }
    case 'p2B': {
      // Runners: 3B scores, 2B scores, 1B → 3B, batter → 2B
      if (has(4)) runs += 1;
      if (has(2)) runs += 1;
      const newR3 = has(1);
      bases = setBases(false, true, newR3);
      break;
    }
    case 'p3B': {
      // All runners score; batter on 3B
      if (has(1)) runs += 1;
      if (has(2)) runs += 1;
      if (has(4)) runs += 1;
      bases = setBases(false, false, true);
      break;
    }
    case 'pHR': {
      if (has(1)) runs += 1;
      if (has(2)) runs += 1;
      if (has(4)) runs += 1;
      runs += 1; // batter
      bases = 0;
      break;
    }
  }

  const ended = outs >= 3;
  return { next: { bases: ended ? 0 : bases, outs }, runs, ended };
}

function sampleEvent(rates: BatterRates, rng: () => number): keyof BatterRates {
  const r = rng();
  let acc = 0;
  const order: (keyof BatterRates)[] = ['pBB', 'pK', 'pHR', 'p3B', 'p2B', 'p1B', 'pOut'];
  for (const k of order) {
    acc += rates[k];
    if (r <= acc) return k;
  }
  return 'pOut';
}

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

/**
 * Expected runs per game for a 9-batter lineup, simulated.
 * Returns mean and 80% CI from N simulations.
 */
export function simulateLineup(rates: BatterRates[], iterations = 5000, seed = 42) {
  if (rates.length !== 9) throw new Error('Need exactly 9 batters');
  const rng = mulberry32(seed);
  const totals: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let leadoff = 0;
    let gameRuns = 0;
    for (let inn = 0; inn < 9; inn++) {
      let state: State = { bases: 0, outs: 0 };
      let bIdx = leadoff;
      while (state.outs < 3) {
        const r = rates[bIdx];
        const ev = sampleEvent(r, rng);
        const { next, runs } = transition(state, ev);
        gameRuns += runs;
        state = next;
        bIdx = (bIdx + 1) % 9;
      }
      leadoff = bIdx;
    }
    totals.push(gameRuns);
  }
  totals.sort((a, b) => a - b);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const lo80 = totals[Math.floor(totals.length * 0.1)];
  const hi80 = totals[Math.floor(totals.length * 0.9)];
  return { meanRunsPerGame: mean, ci80: { low: lo80, high: hi80 }, iterations };
}

/**
 * Heuristic optimization — try N random shuffles of the lineup, return the
 * best by expected R/G. Bounded so we stay snappy server-side.
 */
export function optimizeLineup<T>(
  batters: { id: T; name: string; rates: BatterRates }[],
  iterationsPerLineup = 1000,
  candidatesToTry = 80,
  seed = 7
) {
  if (batters.length !== 9) throw new Error('Need exactly 9 batters');
  const baseline = simulateLineup(batters.map((b) => b.rates), iterationsPerLineup, seed);
  let best = { order: batters.map((_, i) => i), runs: baseline.meanRunsPerGame };

  // Heuristic: start with high-OBP-first heuristic
  const obpRanked = batters
    .map((b, i) => ({ i, score: b.rates.pBB + b.rates.p1B + b.rates.p2B + b.rates.p3B + b.rates.pHR }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.i);
  const obpFirstRun = simulateLineup(obpRanked.map((i) => batters[i].rates), iterationsPerLineup, seed);
  if (obpFirstRun.meanRunsPerGame > best.runs) best = { order: obpRanked, runs: obpFirstRun.meanRunsPerGame };

  // Random search
  const rng = mulberry32(seed);
  for (let c = 0; c < candidatesToTry; c++) {
    const order = [...best.order];
    // 1-2 random swaps from current best
    const i = Math.floor(rng() * 9);
    let j = Math.floor(rng() * 9);
    if (j === i) j = (j + 1) % 9;
    [order[i], order[j]] = [order[j], order[i]];
    const sim = simulateLineup(order.map((idx) => batters[idx].rates), iterationsPerLineup, seed + c);
    if (sim.meanRunsPerGame > best.runs) {
      best = { order, runs: sim.meanRunsPerGame };
    }
  }

  return {
    baseline,
    best,
    bestOrder: best.order.map((idx) => batters[idx]),
  };
}
