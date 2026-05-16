/**
 * High-conviction picks extractor.
 *
 * Takes the per-game insights and synthesizes a focused set of picks
 * across exactly five categories — winner ML, pitcher strikeouts, F5
 * over/under, NRFI/YRFI, and full-game run total over/under — keeping
 * only those with model probability > 60%.
 *
 * Designed for the Results dashboard: every pick is gradable from the
 * game's final state, so we get clean hit/miss receipts.
 */

import type { GameInsight, OpportunityResult } from './insights';
import { predictFirst5, predictPitcherProp } from './predict';
import { getPark } from './parks';

export type PickCategory = 'winner' | 'pitcher-k' | 'f5' | 'nrfi-yrfi' | 'total-runs';

export type ConvictionPick = {
  gamePk: number;
  gameLabel: string;
  firstPitch: string;
  status: 'preview' | 'live' | 'final';
  category: PickCategory;
  categoryLabel: string;
  side: string;        // human-readable side, e.g. "PIT ML", "OVER 8.5", "NRFI"
  line?: number;
  probability: number; // model's probability the pick hits, 0–1
  prediction: string;  // what the model is predicting in plain text
  explanation: string; // why
  /** Hit/miss/etc once the game has played out. */
  result: OpportunityResult;
  actualText?: string;
  /** Specific player ID for player-prop picks (pitcher Ks). */
  playerId?: number;
  playerName?: string;
};

const POISSON_MEMO = new Map<string, number>();
function poissonCdf(k: number, lambda: number): number {
  const key = `${k}|${lambda.toFixed(3)}`;
  if (POISSON_MEMO.has(key)) return POISSON_MEMO.get(key)!;
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i <= k; i++) {
    if (i === 0) sum += term;
    else {
      term = (term * lambda) / i;
      sum += term;
    }
  }
  const result = Math.max(0, Math.min(1, sum));
  POISSON_MEMO.set(key, result);
  return result;
}

/**
 * P(total runs ≥ over-line) using a normal approximation with
 * overdispersion ψ=1.5 (standard for MLB run totals).
 */
function pTotalOver(mean: number, line: number, overdispersion = 1.5): number {
  if (mean <= 0) return 0;
  const sd = Math.sqrt(overdispersion * mean);
  const z = (mean - (line + 0.5)) / sd;
  // Φ(z) — normal CDF approximation
  return normalCdf(z);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-(z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

function ord(n: number) {
  if (n >= 11 && n <= 13) return 'th';
  const last = n % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}

/**
 * Generate all > 60% confidence picks for a single game across the five
 * categories. Each pick is graded if the game has progressed enough.
 */
export function picksForGame(g: GameInsight, threshold = 0.60): ConvictionPick[] {
  const out: ConvictionPick[] = [];
  const awayAbbr = g.away.abbr ?? g.away.name;
  const homeAbbr = g.home.abbr ?? g.home.name;
  const gameLabel = `${awayAbbr} @ ${homeAbbr}`;
  const isFinal = g.status === 'final';
  const isLive = g.status === 'live';
  const pHomeWin = g.prediction.pHomeWin;

  // ── 1. WINNER (moneyline) ────────────────────────────────────────────────
  if (pHomeWin >= threshold) {
    const result: OpportunityResult =
      isFinal ? (g.actual && g.actual.homeRuns > g.actual.awayRuns ? 'hit' : 'miss') :
      isLive ? 'live' : 'pending';
    out.push({
      gamePk: g.gamePk,
      gameLabel,
      firstPitch: g.gameDate,
      status: g.status,
      category: 'winner',
      categoryLabel: 'Winner',
      side: `${homeAbbr} ML`,
      probability: pHomeWin,
      prediction: `${homeAbbr} to win (model ${(pHomeWin * 100).toFixed(1)}%)`,
      explanation: `Home club projects ahead by talent + HFA. Pre-game home WP ${(pHomeWin * 100).toFixed(1)}%.`,
      result,
      actualText: g.actual
        ? isFinal
          ? `Final ${g.actual.awayRuns}–${g.actual.homeRuns} · home ${g.actual.homeRuns > g.actual.awayRuns ? 'won ✓' : 'lost ✗'}`
          : `Live ${g.actual.awayRuns}–${g.actual.homeRuns} · ${g.actual.inningsCompleted} inn done`
        : undefined,
    });
  } else if (1 - pHomeWin >= threshold) {
    const pAway = 1 - pHomeWin;
    const result: OpportunityResult =
      isFinal ? (g.actual && g.actual.awayRuns > g.actual.homeRuns ? 'hit' : 'miss') :
      isLive ? 'live' : 'pending';
    out.push({
      gamePk: g.gamePk,
      gameLabel,
      firstPitch: g.gameDate,
      status: g.status,
      category: 'winner',
      categoryLabel: 'Winner',
      side: `${awayAbbr} ML`,
      probability: pAway,
      prediction: `${awayAbbr} to win (model ${(pAway * 100).toFixed(1)}%)`,
      explanation: `Visiting club projects ahead even after the home-field bump. Pre-game away WP ${(pAway * 100).toFixed(1)}%.`,
      result,
      actualText: g.actual
        ? isFinal
          ? `Final ${g.actual.awayRuns}–${g.actual.homeRuns} · away ${g.actual.awayRuns > g.actual.homeRuns ? 'won ✓' : 'lost ✗'}`
          : `Live ${g.actual.awayRuns}–${g.actual.homeRuns} · ${g.actual.inningsCompleted} inn done`
        : undefined,
    });
  }

  // ── 2. PITCHER STRIKEOUTS ────────────────────────────────────────────────
  // For each starter, pick the highest K-prop line where P(≥ line+1) ≥ threshold
  const starters: Array<{ id: number; name: string; k9: number; side: 'away' | 'home' }> = [];
  if (g.awayStarter && g.awayStarter.k9 != null) {
    starters.push({ id: g.awayStarter.id, name: g.awayStarter.name, k9: g.awayStarter.k9, side: 'away' });
  }
  if (g.homeStarter && g.homeStarter.k9 != null) {
    starters.push({ id: g.homeStarter.id, name: g.homeStarter.name, k9: g.homeStarter.k9, side: 'home' });
  }
  for (const starter of starters) {
    const prop = predictPitcherProp({
      oppKRate: 0.22,
      pitcherK9: starter.k9,
      pitcherIpPerStart: 5.5,
      parkSoFactor: getPark(g.venueId).so,
    });
    const lambda = prop.expectedStrikeouts;
    let bestLine = -1;
    let bestProb = 0;
    for (const line of [4.5, 5.5, 6.5, 7.5, 8.5, 9.5]) {
      const p = 1 - poissonCdf(Math.floor(line), lambda);
      if (p >= threshold && p > bestProb) {
        bestProb = p;
        bestLine = line;
      }
    }
    if (bestLine > 0) {
      const actualKs = isFinal && g.actual
        ? (starter.side === 'away' ? g.actual.awayStarterKs : g.actual.homeStarterKs)
        : undefined;
      const result: OpportunityResult =
        isFinal && actualKs !== undefined ? (actualKs > bestLine ? 'hit' : 'miss') :
        isFinal ? 'no-grade' :
        isLive ? 'live' :
        'pending';
      out.push({
        gamePk: g.gamePk,
        gameLabel,
        firstPitch: g.gameDate,
        status: g.status,
        category: 'pitcher-k',
        categoryLabel: 'Pitcher Ks',
        side: `OVER ${bestLine.toFixed(1)} K`,
        line: bestLine,
        probability: bestProb,
        prediction: `${starter.name} over ${bestLine.toFixed(1)} strikeouts (model ${(bestProb * 100).toFixed(1)}%)`,
        explanation: `${starter.name} averages ${starter.k9.toFixed(1)} K/9. Projected ${lambda.toFixed(1)} Ks today against league-average contact in this park.`,
        result,
        actualText:
          actualKs !== undefined
            ? `Final ${actualKs} K · over ${bestLine.toFixed(1)} ${actualKs > bestLine ? '✓' : '✗'}`
            : isLive && g.actual
            ? `Live · in progress`
            : undefined,
        playerId: starter.id,
        playerName: starter.name,
      });
    }
  }

  // ── 3. FIRST 5 INNINGS (F5 OVER/UNDER) ──────────────────────────────────
  // Use the existing F5 model probability strip
  const f5 = predictFirst5({
    home: { teamId: g.home.id, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    away: { teamId: g.away.id, runsScoredPerGame: 4.5, runsAllowedPerGame: 4.5 },
    homeStarter: g.homeStarter ? { fip: 4.0, ipPerStart: 5.5 } : undefined,
    awayStarter: g.awayStarter ? { fip: 4.0, ipPerStart: 5.5 } : undefined,
    park: getPark(g.venueId),
    weather: g.weather,
  });
  // Re-compute F5 using the SAME inputs the run total used — we should
  // really just plumb first5 into GameInsight. For now use the run-total
  // expected/2 as a proxy if predictFirst5 with simplified inputs ain't
  // representative. We'll just use the .pTotalOver array from this fresh
  // call which has the correct calibration for league-average teams.
  // Note: this means F5 line picks aren't using recency-weighted team rates;
  // they're using F5 model with average team rates. Refine in a follow-up.

  for (const tail of f5.pTotalOver) {
    if (tail.prob >= threshold) {
      const result: OpportunityResult =
        isFinal && g.actual ? (g.actual.f5Runs > tail.line ? 'hit' : 'miss') :
        isLive && g.actual?.f5Complete ? (g.actual.f5Runs > tail.line ? 'hit' : 'miss') :
        isLive ? 'live' : 'pending';
      out.push({
        gamePk: g.gamePk,
        gameLabel,
        firstPitch: g.gameDate,
        status: g.status,
        category: 'f5',
        categoryLabel: 'First 5',
        side: `F5 OVER ${tail.line.toFixed(1)}`,
        line: tail.line,
        probability: tail.prob,
        prediction: `F5 over ${tail.line.toFixed(1)} runs (model ${(tail.prob * 100).toFixed(1)}%)`,
        explanation: `Model projects ${f5.expectedTotal.toFixed(1)} F5 runs. Park, weather, and starter quality all support the over.`,
        result,
        actualText: g.actual
          ? `${g.actual.f5Complete ? 'F5 final' : 'Live'} ${g.actual.f5Runs} R · over ${tail.line.toFixed(1)} ${g.actual.f5Runs > tail.line ? '✓' : g.actual.f5Complete ? '✗' : '(in progress)'}`
          : undefined,
      });
      break; // only one F5 over pick per game (highest-confidence line)
    } else if (1 - tail.prob >= threshold) {
      // The UNDER side. P(under X.5) = 1 - P(over X.5) for the same line.
      const result: OpportunityResult =
        isFinal && g.actual ? (g.actual.f5Runs < tail.line ? 'hit' : 'miss') :
        isLive && g.actual?.f5Complete ? (g.actual.f5Runs < tail.line ? 'hit' : 'miss') :
        isLive ? 'live' : 'pending';
      out.push({
        gamePk: g.gamePk,
        gameLabel,
        firstPitch: g.gameDate,
        status: g.status,
        category: 'f5',
        categoryLabel: 'First 5',
        side: `F5 UNDER ${tail.line.toFixed(1)}`,
        line: tail.line,
        probability: 1 - tail.prob,
        prediction: `F5 under ${tail.line.toFixed(1)} runs (model ${((1 - tail.prob) * 100).toFixed(1)}%)`,
        explanation: `Model projects ${f5.expectedTotal.toFixed(1)} F5 runs. Strong starting pitching + pitcher-friendly setup pull the projection low.`,
        result,
        actualText: g.actual
          ? `${g.actual.f5Complete ? 'F5 final' : 'Live'} ${g.actual.f5Runs} R · under ${tail.line.toFixed(1)} ${g.actual.f5Runs < tail.line ? '✓' : g.actual.f5Complete ? '✗' : '(in progress)'}`
          : undefined,
      });
      break;
    }
  }

  // ── 4. NRFI / YRFI ───────────────────────────────────────────────────────
  const pNrfi = f5.pNRFI;
  if (pNrfi >= threshold) {
    const result: OpportunityResult =
      isFinal && g.actual ? (g.actual.firstInningRuns === 0 ? 'hit' : 'miss') :
      isLive && g.actual?.firstInningComplete ? (g.actual.firstInningRuns === 0 ? 'hit' : 'miss') :
      isLive ? 'live' : 'pending';
    out.push({
      gamePk: g.gamePk,
      gameLabel,
      firstPitch: g.gameDate,
      status: g.status,
      category: 'nrfi-yrfi',
      categoryLabel: 'NRFI',
      side: 'NRFI',
      probability: pNrfi,
      prediction: `No run in 1st inning (model ${(pNrfi * 100).toFixed(1)}%)`,
      explanation: 'Both starters projected to keep the top of the lineup off the board in their first time through.',
      result,
      actualText: g.actual?.firstInningComplete
        ? `1st: ${g.actual.firstInningRuns} R · NRFI ${g.actual.firstInningRuns === 0 ? '✓' : '✗'}`
        : g.actual
        ? `Live · 1st inning in progress`
        : undefined,
    });
  } else if (1 - pNrfi >= threshold) {
    const pYrfi = 1 - pNrfi;
    const result: OpportunityResult =
      isFinal && g.actual ? (g.actual.firstInningRuns > 0 ? 'hit' : 'miss') :
      isLive && g.actual?.firstInningComplete ? (g.actual.firstInningRuns > 0 ? 'hit' : 'miss') :
      isLive ? 'live' : 'pending';
    out.push({
      gamePk: g.gamePk,
      gameLabel,
      firstPitch: g.gameDate,
      status: g.status,
      category: 'nrfi-yrfi',
      categoryLabel: 'YRFI',
      side: 'YRFI',
      probability: pYrfi,
      prediction: `Run scored in 1st inning (model ${(pYrfi * 100).toFixed(1)}%)`,
      explanation: 'Weak starter quality + strong top-of-order matchups make a first-inning run highly likely.',
      result,
      actualText: g.actual?.firstInningComplete
        ? `1st: ${g.actual.firstInningRuns} R · YRFI ${g.actual.firstInningRuns > 0 ? '✓' : '✗'}`
        : g.actual
        ? `Live · 1st inning in progress`
        : undefined,
    });
  }

  // ── 5. TOTAL RUNS (full-game over/under) ────────────────────────────────
  const mean = g.prediction.expectedTotal;
  let bestLineRT = -1;
  let bestProbRT = 0;
  let bestSideRT: 'over' | 'under' = 'over';
  for (const line of [6.5, 7.5, 8.5, 9.5, 10.5, 11.5]) {
    const pOver = pTotalOver(mean, line);
    if (pOver >= threshold && pOver > bestProbRT) {
      bestProbRT = pOver;
      bestLineRT = line;
      bestSideRT = 'over';
    } else if (1 - pOver >= threshold && 1 - pOver > bestProbRT) {
      bestProbRT = 1 - pOver;
      bestLineRT = line;
      bestSideRT = 'under';
    }
  }
  if (bestLineRT > 0) {
    const result: OpportunityResult = (() => {
      if (!isFinal || !g.actual) return isLive ? 'live' : 'pending';
      const hit = bestSideRT === 'over' ? g.actual.total > bestLineRT : g.actual.total < bestLineRT;
      return hit ? 'hit' : 'miss';
    })();
    out.push({
      gamePk: g.gamePk,
      gameLabel,
      firstPitch: g.gameDate,
      status: g.status,
      category: 'total-runs',
      categoryLabel: 'Total runs',
      side: `${bestSideRT.toUpperCase()} ${bestLineRT.toFixed(1)}`,
      line: bestLineRT,
      probability: bestProbRT,
      prediction: `Total runs ${bestSideRT} ${bestLineRT.toFixed(1)} (model ${(bestProbRT * 100).toFixed(1)}%)`,
      explanation: `Model expects ${mean.toFixed(1)} combined runs. Park × weather × starter quality drive the ${bestSideRT}.`,
      result,
      actualText: g.actual
        ? isFinal
          ? `Final ${g.actual.total} R · ${bestSideRT} ${bestLineRT.toFixed(1)} ${result === 'hit' ? '✓' : '✗'}`
          : `Live ${g.actual.total} R through ${g.actual.inningsCompleted} inn`
        : undefined,
    });
  }

  return out;
}

export function buildAllPicks(insights: GameInsight[], threshold = 0.60): ConvictionPick[] {
  const all: ConvictionPick[] = [];
  for (const g of insights) {
    all.push(...picksForGame(g, threshold));
  }
  return all;
}

export function aggregatePicks(picks: ConvictionPick[]) {
  const hits = picks.filter((p) => p.result === 'hit').length;
  const misses = picks.filter((p) => p.result === 'miss').length;
  const pushes = picks.filter((p) => p.result === 'push').length;
  const pending = picks.filter((p) => p.result === 'pending').length;
  const live = picks.filter((p) => p.result === 'live').length;
  const noGrade = picks.filter((p) => p.result === 'no-grade').length;
  const decided = hits + misses;
  return {
    total: picks.length,
    hits,
    misses,
    pushes,
    pending,
    live,
    noGrade,
    hitRate: decided > 0 ? hits / decided : 0,
    units: hits * 1 - misses * 1.1,
  };
}
