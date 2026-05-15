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
 * Live home win probability given the current game state.
 *
 * When MLB doesn't publish per-play win probability (which happens for the
 * first inning or two of many games, and for games not yet scored on by
 * Sportradar), we derive a defensible WP from score differential + innings
 * remaining + pre-game talent prior.
 *
 * Model
 * -----
 *   logit = priorLogit * priorWeight + scoreEffect
 *   priorLogit = log(preGameHomeWP / (1 - preGameHomeWP))
 *   priorWeight = inningsRemaining / 9   (decays linearly to 0)
 *   scoreEffect = scoreDiff * runWeight
 *   runWeight   = 0.55 / sqrt(inningsRemaining)   (each run worth more late)
 *
 * Returns home WP in [0.01, 0.99]. Calibrates roughly to:
 *   tied middle-innings → near pre-game prior
 *   ahead by 1 in 9th  → ~85% home
 *   ahead by 2 in 9th  → ~95% home
 *   behind by 3 in 7th → ~10% home
 */
export function liveHomeWP(state: LiveGameState, preGameHomeWP: number): number {
  const inningsCompleted = computeInningsCompleted(state);
  const inningsRemaining = Math.max(0, 9 - inningsCompleted);
  const diff = state.homeRuns - state.awayRuns;

  // Game is over (or essentially over)
  if (inningsRemaining <= 0) {
    if (diff > 0) return 0.99;
    if (diff < 0) return 0.01;
    return 0.5;
  }

  const priorWeight = inningsRemaining / 9;
  const priorLogit = Math.log(Math.max(1e-9, preGameHomeWP) / Math.max(1e-9, 1 - preGameHomeWP));
  const runWeight = 0.55 / Math.sqrt(inningsRemaining);
  const scoreEffect = diff * runWeight;
  const finalLogit = priorLogit * priorWeight + scoreEffect;
  const wp = 1 / (1 + Math.exp(-finalLogit));
  return Math.max(0.01, Math.min(0.99, wp));
}

/**
 * Build a synthetic live-WP series from the linescore by stepping through
 * each completed inning and recomputing WP at that score state. Falls back
 * to a single pre-game point if no innings have completed.
 */
export function buildLiveWPSeries(
  state: LiveGameState,
  preGameHomeWP: number
): Array<{ idx: number; inning: number; half: 'top' | 'bot'; homeWP: number; desc?: string }> {
  const series: Array<{ idx: number; inning: number; half: 'top' | 'bot'; homeWP: number; desc?: string }> = [];

  // Always start with the pre-game point
  series.push({ idx: 0, inning: 0, half: 'top', homeWP: preGameHomeWP, desc: 'Pre-game projection' });

  // Walk through each inning, building running scores and computing WP at each half
  let runningHome = 0;
  let runningAway = 0;
  let idx = 1;
  for (const inn of state.innings) {
    if (inn.away?.runs !== undefined) {
      runningAway += inn.away.runs;
      const intermediateState: LiveGameState = {
        ...state,
        inning: inn.num,
        isTopInning: false, // we're after the top half
        outs: 3,
        homeRuns: runningHome,
        awayRuns: runningAway,
        innings: state.innings.slice(0, inn.num).map((x) => ({
          num: x.num,
          away: x.num <= inn.num ? x.away : undefined,
          home: x.num < inn.num ? x.home : undefined,
        })),
      };
      const wp = liveHomeWP(intermediateState, preGameHomeWP);
      const delta = inn.away.runs;
      series.push({
        idx: idx++,
        inning: inn.num,
        half: 'top',
        homeWP: wp,
        desc: `End top ${inn.num}${ord(inn.num)}${delta > 0 ? ` · ${delta}R` : ''} · ${runningAway}–${runningHome}`,
      });
    }
    if (inn.home?.runs !== undefined) {
      runningHome += inn.home.runs;
      const intermediateState: LiveGameState = {
        ...state,
        inning: inn.num,
        isTopInning: true, // we're after the bottom half (start of next inning's top)
        outs: 0,
        homeRuns: runningHome,
        awayRuns: runningAway,
        innings: state.innings.slice(0, inn.num + 1).map((x) => ({
          num: x.num,
          away: x.num <= inn.num ? x.away : undefined,
          home: x.num <= inn.num ? x.home : undefined,
        })),
      };
      const wp = liveHomeWP(intermediateState, preGameHomeWP);
      const delta = inn.home.runs;
      series.push({
        idx: idx++,
        inning: inn.num,
        half: 'bot',
        homeWP: wp,
        desc: `End bot ${inn.num}${ord(inn.num)}${delta > 0 ? ` · ${delta}R` : ''} · ${runningAway}–${runningHome}`,
      });
    }
  }

  // Always end with the current state as the final point so the line tail
  // points at where the game actually is right now.
  const currentWP = liveHomeWP(state, preGameHomeWP);
  series.push({
    idx: idx,
    inning: state.inning,
    half: state.isTopInning ? 'top' : 'bot',
    homeWP: currentWP,
    desc: `Now · ${state.awayRuns}–${state.homeRuns}`,
  });

  return series;
}

function ord(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  const last = n % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
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
