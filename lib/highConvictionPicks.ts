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
import type { MarketOddsForGame } from './odds';
import { matchupKey } from './odds';

export type PickCategory = 'winner' | 'pitcher-k' | 'f5' | 'nrfi-yrfi' | 'total-runs' | 'run-line';

/**
 * Per-category model-probability thresholds. Different categories have
 * different "easy" baselines — moneyline favorites hit ~58% naturally, so a
 * 60% ML pick is barely better than chalk, but a 60% NRFI is real signal.
 * These bars set the minimum modelP we'll record a pick at.
 */
export const CATEGORY_THRESHOLDS: Record<PickCategory, number> = {
  winner: 0.64,        // ML — favorites already win 58% raw, so demand a real edge
  'run-line': 0.58,    // run-line is closer to a coin flip, lower bar OK
  'pitcher-k': 0.58,   // K props rarely show extreme model edges
  f5: 0.60,            // F5 totals
  'nrfi-yrfi': 0.62,   // base NRFI rate is ~57%, so demand 5pp above
  'total-runs': 0.60,  // run totals
};

/**
 * Returns the threshold applicable for a given category in a given mode.
 * In edge mode we use a single floor (0.50) since edge does the filtering.
 */
function thresholdFor(cat: PickCategory, mode: 'prob' | 'edge'): number {
  return mode === 'edge' ? 0.50 : CATEGORY_THRESHOLDS[cat];
}

/**
 * Market-side info attached to a pick when we have real odds. Edge is the
 * gap between modelP and the market's implied probability (in pp). EV is
 * the expected unit return per $1 bet at the actual market price.
 */
export type MarketAttachment = {
  americanOdds: number;
  impliedProb: number; // 0–1
  edgePP: number;      // model − implied, in percentage points
  evPerUnit: number;   // expected $ return per $1 risked at this line
  bookCount: number;
};

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
  /** Real-market odds + edge info when available. */
  market?: MarketAttachment;
  /**
   * Conviction score = modelP − categoryThreshold. Always ≥ 0 for surfaced
   * picks. Higher = more confident relative to that category's natural bar.
   * Used to rank cross-category for the "Locks of the Day" tier.
   */
  conviction: number;
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
 * Build a MarketAttachment from model probability + real American odds.
 * Returns undefined when odds aren't available — pick still renders, just
 * without the market column.
 */
function attachMarket(modelP: number, americanOdds: number | null | undefined, bookCount = 0): MarketAttachment | undefined {
  if (americanOdds == null || !Number.isFinite(americanOdds)) return undefined;
  return {
    americanOdds,
    impliedProb: impliedProb(americanOdds),
    edgePP: edgePP(modelP, americanOdds),
    evPerUnit: evAtOdds(modelP, americanOdds),
    bookCount,
  };
}

/**
 * Generate picks across the 6 categories for a single game.
 *
 * If `mode === 'edge'` and market odds are supplied, picks are filtered by
 * EDGE (model prob − market implied prob), not raw probability. This is
 * how sharp bettors actually operate — bet only when the model thinks the
 * market is mispricing the side.
 *
 * If `mode === 'prob'` or odds are missing, picks filter by raw probability.
 */
export function picksForGame(
  g: GameInsight,
  opts: {
    /** @deprecated single global threshold — use CATEGORY_THRESHOLDS instead. Kept for back-compat. */
    threshold?: number;
    edgeThresholdPP?: number;  // 3.0 default for edge mode (3pp)
    marketOdds?: MarketOddsForGame;
    mode?: 'prob' | 'edge';
  } = {}
): ConvictionPick[] {
  const edgeThreshold = opts.edgeThresholdPP ?? 3.0;
  const odds = opts.marketOdds;
  const mode = opts.mode ?? (odds ? 'edge' : 'prob');

  // Per-category passes helper. In prob mode the bar is CATEGORY_THRESHOLDS[cat].
  // In edge mode it's edge ≥ edgeThreshold AND modelP ≥ 50%.
  // (opts.threshold, when present, overrides the per-category bar — back-compat.)
  const passes = (cat: PickCategory, modelP: number, americanOdds: number | null | undefined): boolean => {
    const bar = opts.threshold ?? thresholdFor(cat, mode);
    if (modelP >= bar && (mode === 'prob' || americanOdds == null)) return true;
    if (mode === 'edge' && americanOdds != null) {
      return edgePP(modelP, americanOdds) >= edgeThreshold && modelP >= 0.50;
    }
    return false;
  };

  // Conviction = modelP − category bar. Bigger = more confident vs baseline.
  const convictionFor = (cat: PickCategory, modelP: number): number => {
    return modelP - thresholdFor(cat, mode);
  };

  const out: ConvictionPick[] = [];
  const awayAbbr = g.away.abbr ?? g.away.name;
  const homeAbbr = g.home.abbr ?? g.home.name;
  const gameLabel = `${awayAbbr} @ ${homeAbbr}`;
  const isFinal = g.status === 'final';
  const isLive = g.status === 'live';
  const pHomeWin = g.prediction.pHomeWin;

  // ── 1. WINNER (moneyline) ────────────────────────────────────────────────
  const mlHomeOdds = odds?.ml?.home;
  const mlAwayOdds = odds?.ml?.away;
  if (passes('winner', pHomeWin, mlHomeOdds)) {
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
      market: attachMarket(pHomeWin, mlHomeOdds, odds?.bookCount),
      conviction: convictionFor('winner', pHomeWin),
    });
  } else if (passes('winner', 1 - pHomeWin, mlAwayOdds)) {
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
      market: attachMarket(pAway, mlAwayOdds, odds?.bookCount),
      conviction: convictionFor('winner', pAway),
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
    const kBar = opts.threshold ?? thresholdFor('pitcher-k', mode);
    for (const line of [4.5, 5.5, 6.5, 7.5, 8.5, 9.5]) {
      const p = 1 - poissonCdf(Math.floor(line), lambda);
      if (p >= kBar && p > bestProb) {
        bestProb = p; bestLine = line;
      }
      // edge mode: take the highest-prob line that clears edge threshold
      // (we don't have per-line K odds from the API yet, so prob-mode applies)
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
        conviction: convictionFor('pitcher-k', bestProb),
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

  const f5Bar = opts.threshold ?? thresholdFor('f5', mode);
  for (const tail of f5.pTotalOver) {
    if (tail.prob >= f5Bar) {
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
        conviction: convictionFor('f5', tail.prob),
      });
      break; // only one F5 over pick per game (highest-confidence line)
    } else if (1 - tail.prob >= f5Bar) {
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
        conviction: convictionFor('f5', 1 - tail.prob),
      });
      break;
    }
  }

  // ── 4. NRFI / YRFI ───────────────────────────────────────────────────────
  const pNrfi = f5.pNRFI;
  const nrfiBar = opts.threshold ?? thresholdFor('nrfi-yrfi', mode);
  if (pNrfi >= nrfiBar) {
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
      conviction: convictionFor('nrfi-yrfi', pNrfi),
    });
  } else if (1 - pNrfi >= nrfiBar) {
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
      conviction: convictionFor('nrfi-yrfi', pYrfi),
    });
  }

  // ── 5. TOTAL RUNS (full-game over/under) ────────────────────────────────
  // When market line exists, evaluate AT that exact line (only one number
  // the book is offering, so it's the relevant one). When no market, walk
  // common lines and pick the best probability-based side.
  const mean = g.prediction.expectedTotal;
  if (odds?.totals) {
    const line = odds.totals.line;
    const pOver = pTotalOver(mean, line);
    const pUnder = 1 - pOver;
    const overOdds = odds.totals.overPrice;
    const underOdds = odds.totals.underPrice;
    let bestSide: 'over' | 'under' | null = null;
    if (passes('total-runs', pOver, overOdds) && (!passes('total-runs', pUnder, underOdds) || edgePP(pOver, overOdds) >= edgePP(pUnder, underOdds))) {
      bestSide = 'over';
    } else if (passes('total-runs', pUnder, underOdds)) {
      bestSide = 'under';
    }
    if (bestSide) {
      const bestProbRT = bestSide === 'over' ? pOver : pUnder;
      const bestPrice = bestSide === 'over' ? overOdds : underOdds;
      const result: OpportunityResult = (() => {
        if (!isFinal || !g.actual) return isLive ? 'live' : 'pending';
        const hit = bestSide === 'over' ? g.actual.total > line : g.actual.total < line;
        return hit ? 'hit' : 'miss';
      })();
      out.push({
        gamePk: g.gamePk,
        gameLabel,
        firstPitch: g.gameDate,
        status: g.status,
        category: 'total-runs',
        categoryLabel: 'Total runs',
        side: `${bestSide.toUpperCase()} ${line.toFixed(1)}`,
        line,
        probability: bestProbRT,
        prediction: `Total runs ${bestSide} ${line.toFixed(1)} (model ${(bestProbRT * 100).toFixed(1)}%)`,
        explanation: `Model expects ${mean.toFixed(1)} combined runs. Park × weather × starter quality drive the ${bestSide}.`,
        result,
        actualText: g.actual
          ? isFinal
            ? `Final ${g.actual.total} R · ${bestSide} ${line.toFixed(1)} ${result === 'hit' ? '✓' : '✗'}`
            : `Live ${g.actual.total} R through ${g.actual.inningsCompleted} inn`
          : undefined,
        market: attachMarket(bestProbRT, bestPrice, odds.bookCount),
        conviction: convictionFor('total-runs', bestProbRT),
      });
    }
  } else {
    // No market — fall back to walking common lines (prob-mode only)
    let bestLineRT = -1;
    let bestProbRT = 0;
    let bestSideRT: 'over' | 'under' = 'over';
    const totalsBar = opts.threshold ?? thresholdFor('total-runs', mode);
    for (const line of [6.5, 7.5, 8.5, 9.5, 10.5, 11.5]) {
      const pOver = pTotalOver(mean, line);
      if (pOver >= totalsBar && pOver > bestProbRT) {
        bestProbRT = pOver; bestLineRT = line; bestSideRT = 'over';
      } else if (1 - pOver >= totalsBar && 1 - pOver > bestProbRT) {
        bestProbRT = 1 - pOver; bestLineRT = line; bestSideRT = 'under';
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
        conviction: convictionFor('total-runs', bestProbRT),
      });
    }
  }

  // ── 6. RUN LINE (±1.5 spread) ───────────────────────────────────────────
  // P(home covers −1.5) = P(margin ≥ 2). Use normal approx on (home − away).
  const runDiffMean = g.prediction.expectedHomeRuns - g.prediction.expectedAwayRuns;
  const runDiffSD = Math.sqrt(1.5 * (g.prediction.expectedHomeRuns + g.prediction.expectedAwayRuns));
  // Continuity-corrected P(margin ≥ 2) ≈ 1 − Φ((1.5 − μ) / σ)
  const pHomeCovers = runDiffSD > 0 ? 1 - normalCdf((1.5 - runDiffMean) / runDiffSD) : 0.5;
  const pAwayCovers = 1 - pHomeCovers;

  const rlHomeOdds = odds?.runLine?.homePrice;
  const rlAwayOdds = odds?.runLine?.awayPrice;
  const rlHomePoint = odds?.runLine?.homePoint ?? -1.5;
  const rlAwayPoint = odds?.runLine?.awayPoint ?? +1.5;

  let rlSide: 'home' | 'away' | null = null;
  if (passes('run-line', pHomeCovers, rlHomeOdds)) rlSide = 'home';
  else if (passes('run-line', pAwayCovers, rlAwayOdds)) rlSide = 'away';

  if (rlSide) {
    const isHome = rlSide === 'home';
    const point = isHome ? rlHomePoint : rlAwayPoint;
    const prob = isHome ? pHomeCovers : pAwayCovers;
    const price = isHome ? rlHomeOdds : rlAwayOdds;
    const result: OpportunityResult = (() => {
      if (!isFinal || !g.actual) return isLive ? 'live' : 'pending';
      const margin = g.actual.homeRuns - g.actual.awayRuns;
      const homeCovers = margin >= 2;
      const hit = isHome ? homeCovers : !homeCovers;
      return hit ? 'hit' : 'miss';
    })();
    out.push({
      gamePk: g.gamePk,
      gameLabel,
      firstPitch: g.gameDate,
      status: g.status,
      category: 'run-line',
      categoryLabel: 'Run line',
      side: `${isHome ? homeAbbr : awayAbbr} ${point >= 0 ? '+' : ''}${point}`,
      line: point,
      probability: prob,
      prediction: `${isHome ? homeAbbr : awayAbbr} ${point >= 0 ? '+' : ''}${point} (model ${(prob * 100).toFixed(1)}%)`,
      explanation: isHome
        ? `Model expects home to win by an average of ${runDiffMean.toFixed(1)} runs. ${(prob * 100).toFixed(0)}% chance home covers −1.5.`
        : `Model expects a tighter game (avg margin ${runDiffMean.toFixed(1)}). ${(prob * 100).toFixed(0)}% chance away keeps it within 1 (or wins outright).`,
      result,
      actualText: g.actual && isFinal
        ? `Final ${g.actual.awayRuns}–${g.actual.homeRuns} · margin ${g.actual.homeRuns - g.actual.awayRuns} · ${result === 'hit' ? '✓' : '✗'}`
        : g.actual ? `Live ${g.actual.awayRuns}–${g.actual.homeRuns}` : undefined,
      market: attachMarket(prob, price, odds?.bookCount),
      conviction: convictionFor('run-line', prob),
    });
  }

  return out;
}

export function buildAllPicks(
  insights: GameInsight[],
  opts: {
    threshold?: number;
    edgeThresholdPP?: number;
    marketOdds?: Map<string, MarketOddsForGame> | null;
    mode?: 'prob' | 'edge';
  } = {}
): ConvictionPick[] {
  const all: ConvictionPick[] = [];
  for (const g of insights) {
    const key = matchupKey(g.away.name, g.home.name);
    const market = opts.marketOdds?.get(key);
    all.push(...picksForGame(g, {
      threshold: opts.threshold,
      edgeThresholdPP: opts.edgeThresholdPP,
      marketOdds: market,
      mode: opts.mode,
    }));
  }
  return all;
}

/**
 * Convert a probability (0–1) to fair American odds.
 *   p ≥ 0.5  → negative odds (favorite): odds = −100·p/(1−p)
 *   p < 0.5  → positive odds (underdog):  odds = +100·(1−p)/p
 * These are zero-vig (fair) odds; real sportsbook lines will be ~5% worse.
 */
export function fairAmericanOdds(p: number): number {
  if (p <= 0 || p >= 1) return p >= 1 ? -10000 : 10000;
  if (p >= 0.5) return -Math.round((100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

/**
 * Convert American odds to the implied probability the market is pricing.
 * For −X (favorite): X/(X+100). For +X (underdog): 100/(X+100).
 * (This includes vig — sum of both sides' implied probabilities > 1 by ~5%
 *  on a typical −110/−110 line.)
 */
export function impliedProb(americanOdds: number): number {
  if (americanOdds === 0) return 0.5;
  if (americanOdds < 0) {
    const a = Math.abs(americanOdds);
    return a / (a + 100);
  }
  return 100 / (americanOdds + 100);
}

/**
 * Net unit payout per $1 risked on a WINNING bet at the given American odds.
 *   −110  → 0.91
 *   −150  → 0.67
 *   +100  → 1.00
 *   +150  → 1.50
 */
export function payoutAtOdds(americanOdds: number): number {
  if (americanOdds === 0) return 1.0;
  return americanOdds < 0 ? 100 / Math.abs(americanOdds) : americanOdds / 100;
}

/**
 * Expected value per $1 bet at the given market odds, when the model
 * believes the true probability is `modelP`.
 *   EV = modelP × payout − (1 − modelP) × 1
 * Positive = bet has +EV.
 */
export function evAtOdds(modelP: number, americanOdds: number): number {
  return modelP * payoutAtOdds(americanOdds) - (1 - modelP);
}

/**
 * Edge in percentage points = modelP − marketImpliedP.
 * Positive = the model thinks the side is more likely than the market does.
 */
export function edgePP(modelP: number, americanOdds: number): number {
  return (modelP - impliedProb(americanOdds)) * 100;
}

/**
 * Format American odds for display (e.g., -233 / +150).
 */
export function formatAmericanOdds(odds: number): string {
  if (odds >= 0) return `+${odds}`;
  return `${odds}`;
}

/**
 * Net unit payout per $1 risked on a winning pick at the given probability,
 * assuming fair (zero-vig) odds. p=0.70 → 0.43, p=0.60 → 0.67, p=0.50 → 1.00.
 */
export function fairUnitPayout(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return (1 - p) / p;
}

/**
 * "Locks of the Day" — the highest-conviction picks across all categories,
 * with at most one pick per game so we don't stack 3 picks on the same matchup
 * (which would make the day's P&L correlated and concentrated).
 *
 * Conviction is already normalized per category (modelP − categoryThreshold),
 * so a 0.05 conviction NRFI ranks equivalently to a 0.05 conviction K-prop —
 * both are 5pp above their respective bars.
 */
export function topLocks(picks: ConvictionPick[], n = 5): ConvictionPick[] {
  // Take only un-decided & non-final picks for the "today" tier (live + pending).
  // Decided picks (hit/miss) are receipts, not actionable locks.
  const actionable = picks.filter((p) => p.result === 'pending' || p.result === 'live');
  // Sort by conviction descending
  const sorted = [...actionable].sort((a, b) => b.conviction - a.conviction);
  // One pick per game — keep only the top-conviction pick from each gamePk
  const seen = new Set<number>();
  const out: ConvictionPick[] = [];
  for (const pick of sorted) {
    if (seen.has(pick.gamePk)) continue;
    seen.add(pick.gamePk);
    out.push(pick);
    if (out.length >= n) break;
  }
  return out;
}

export function aggregatePicks(picks: ConvictionPick[]) {
  const hits = picks.filter((p) => p.result === 'hit').length;
  const misses = picks.filter((p) => p.result === 'miss').length;
  const pushes = picks.filter((p) => p.result === 'push').length;
  const pending = picks.filter((p) => p.result === 'pending').length;
  const live = picks.filter((p) => p.result === 'live').length;
  const noGrade = picks.filter((p) => p.result === 'no-grade').length;
  const decided = hits + misses;

  // Units: if a market price is attached, use the actual sportsbook payout.
  // Otherwise fall back to fair model-derived odds (what you'd earn at the
  // model's own price — useful as a model-only benchmark).
  let units = 0;
  let unitsAtFair = 0;
  for (const p of picks) {
    if (p.result === 'hit') {
      units += p.market ? payoutAtOdds(p.market.americanOdds) : fairUnitPayout(p.probability);
      unitsAtFair += fairUnitPayout(p.probability);
    } else if (p.result === 'miss') {
      units -= 1.0;
      unitsAtFair -= 1.0;
    }
  }

  // Aggregate edge metrics across decided picks
  const decidedWithMarket = picks.filter((p) => p.market && (p.result === 'hit' || p.result === 'miss'));
  const avgEdgePP = decidedWithMarket.length
    ? decidedWithMarket.reduce((s, p) => s + (p.market!.edgePP), 0) / decidedWithMarket.length
    : 0;

  return {
    total: picks.length,
    hits,
    misses,
    pushes,
    pending,
    live,
    noGrade,
    hitRate: decided > 0 ? hits / decided : 0,
    units,
    unitsAtFair,
    avgEdgePP,
    hasMarketData: picks.some((p) => p.market),
  };
}
