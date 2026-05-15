/**
 * Live in-game adjustments — recompute predictions given actual game state.
 *
 * Pre-game predictions are baked at first pitch and never updated. Once a
 * game is in progress, the actual unfolding state matters far more than
 * pre-game inputs. This module re-evaluates run-total predictions and grades
 * already-completed sub-game segments (1st inning, F5).
 */

export type LiveGameState = {
  inning: number;
  isTopInning: boolean;
  outs: number;
  awayRuns: number;
  homeRuns: number;
  innings: Array<{ num: number; away?: { runs?: number }; home?: { runs?: number } }>;
};

/**
 * Given a pre-game expected total and the current state, project the final
 * total. Uses a simple rate carry-forward: remaining-innings × per-inning rate.
 *
 * The carry rate adjusts toward the actual observed rate as more innings
 * accumulate (a Bayesian update — early game weights pre-game projection,
 * late game weights actual pace).
 */
export function liveProjectedTotal(
  preGameTotal: number,
  state: LiveGameState
): { live: number; rateCarry: number; inningsRemaining: number } {
  const inningsCompleted = computeInningsCompleted(state);
  const inningsRemaining = Math.max(0, 9 - inningsCompleted);
  const totalSoFar = state.awayRuns + state.homeRuns;

  // Pre-game per-inning rate
  const preGameRate = preGameTotal / 9;
  // Actual observed rate (only meaningful if at least 1 inning done)
  const actualRate = inningsCompleted > 0 ? totalSoFar / inningsCompleted : preGameRate;

  // Bayesian-ish blend: weight actual increasingly with sample size
  const actualWeight = Math.min(0.85, inningsCompleted / 9);
  const blendedRate = preGameRate * (1 - actualWeight) + actualRate * actualWeight;

  return {
    live: totalSoFar + blendedRate * inningsRemaining,
    rateCarry: blendedRate,
    inningsRemaining,
  };
}

function computeInningsCompleted(state: LiveGameState): number {
  // If the bottom of inning N is over, N innings are completed
  // Approximate using current inning + half: if isTopInning, only inning-1 are done
  // else if outs === 3 in the bottom (mid-inning state), inning is done
  // simpler: count innings array entries with both halves resolved
  let done = 0;
  for (const inn of state.innings) {
    if (inn.away?.runs !== undefined && inn.home?.runs !== undefined) {
      done = inn.num;
    } else if (inn.away?.runs !== undefined) {
      // top is done, bottom in progress / not yet
      done = inn.num - 0.5;
    }
  }
  return done;
}

/**
 * Grade a pre-game NRFI prediction given the current state.
 *   - If the 1st inning has fully completed: 'win' if 0 runs, 'loss' otherwise
 *   - If the 1st is not yet over: 'pending'
 */
export function gradeNRFI(state: LiveGameState): 'win' | 'loss' | 'pending' {
  const first = state.innings.find((i) => i.num === 1);
  if (!first) return 'pending';
  // Need both halves resolved
  if (first.away?.runs === undefined) return 'pending';
  if (state.inning === 1 && state.isTopInning === false && state.outs < 3) return 'pending';
  // After top of 1st: if any runs scored top of 1st, it's already a loss for NRFI
  const topRuns = first.away?.runs ?? 0;
  if (topRuns > 0) return 'loss';
  // Need bottom of 1st to be over for the win to lock
  if (first.home?.runs === undefined) return 'pending';
  // If we're past the 1st inning entirely, both halves resolved
  if (state.inning > 1 || (state.inning === 1 && state.isTopInning === false && state.outs >= 3)) {
    const totalFirst = (first.away?.runs ?? 0) + (first.home?.runs ?? 0);
    return totalFirst === 0 ? 'win' : 'loss';
  }
  return 'pending';
}

/**
 * Grade a pre-game F5 prediction (over/under at a given line).
 *   - If F5 isn't complete: 'pending'
 *   - If complete: compare F5 total to line
 */
export function gradeF5(state: LiveGameState, line: number, side: 'over' | 'under'): { result: 'win' | 'loss' | 'push' | 'pending'; f5Runs: number | null } {
  // F5 is complete only when bottom of 5th is over (or game has gone past 5)
  const f5Complete = state.inning > 5 || (state.inning === 5 && state.isTopInning === false && state.outs >= 3);
  if (!f5Complete) {
    // Compute partial F5 to display
    const partial = state.innings.slice(0, 5).reduce((s, i) => s + (i.away?.runs ?? 0) + (i.home?.runs ?? 0), 0);
    return { result: 'pending', f5Runs: partial };
  }
  const f5Runs = state.innings.slice(0, 5).reduce((s, i) => s + (i.away?.runs ?? 0) + (i.home?.runs ?? 0), 0);
  if (side === 'over') {
    if (f5Runs > line) return { result: 'win', f5Runs };
    if (f5Runs < line) return { result: 'loss', f5Runs };
    return { result: 'push', f5Runs };
  } else {
    if (f5Runs < line) return { result: 'win', f5Runs };
    if (f5Runs > line) return { result: 'loss', f5Runs };
    return { result: 'push', f5Runs };
  }
}

/**
 * "Is your over still live?" — for a run-total over X.5:
 *   - runsNeeded = (X + 1) - currentTotal
 *   - inningsLeft = 9 - inningsCompleted
 *   - perInningRequired = runsNeeded / inningsLeft
 * Compare to liveRate to color the verdict.
 */
export function overStillLive(state: LiveGameState, line: number, liveRate: number): {
  status: 'lock' | 'live' | 'longshot' | 'dead';
  runsNeeded: number;
  perInningRequired: number;
} {
  const totalSoFar = state.awayRuns + state.homeRuns;
  const inningsCompleted = computeInningsCompleted(state);
  const inningsLeft = Math.max(0, 9 - inningsCompleted);
  const runsNeeded = Math.max(0, line + 1 - totalSoFar);
  if (runsNeeded === 0) {
    return { status: 'lock', runsNeeded: 0, perInningRequired: 0 };
  }
  if (inningsLeft === 0) {
    return { status: 'dead', runsNeeded, perInningRequired: Infinity };
  }
  const perInningRequired = runsNeeded / inningsLeft;
  let status: 'lock' | 'live' | 'longshot' | 'dead';
  if (perInningRequired <= liveRate * 0.8) status = 'live';
  else if (perInningRequired <= liveRate * 1.5) status = 'longshot';
  else status = 'dead';
  return { status, runsNeeded, perInningRequired };
}
