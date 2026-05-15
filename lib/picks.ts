/**
 * Pick types, snapshot creation, and auto-grading.
 *
 * Categories
 * ----------
 *   run-total-over   — model expects > X.5 runs in the full game
 *   run-total-under  — model expects < X.5 runs in the full game
 *   nrfi             — model favors no run in 1st inning
 *   yrfi             — model favors run in 1st inning
 *   home-ml          — model favors home moneyline
 *   away-ml          — model favors away moneyline
 *   f5-over          — model expects > X.5 runs in F5
 *   f5-under         — model expects < X.5 runs in F5
 *
 * Storage layout
 * --------------
 *   picks:YYYY-MM-DD                 → DailyPicksSnapshot { date, createdAt, picks }
 *   picks-graded:YYYY-MM-DD          → DailyGradeRecord  { date, gradedAt, picks (with results) }
 *   picks-index                      → list of dates for which we have picks
 */

import { getJson, setJson, listByPrefix } from './picksStore';
import { buildSlateInsights } from './insights';
import { getGameLive } from './mlb';

export type PickCategory =
  | 'run-total-over'
  | 'run-total-under'
  | 'nrfi'
  | 'yrfi'
  | 'home-ml'
  | 'away-ml'
  | 'f5-over'
  | 'f5-under';

export type PickResult = 'win' | 'loss' | 'push' | 'pending' | 'no-action';

export type LoggedPick = {
  id: string;
  date: string; // YYYY-MM-DD (slate date)
  gamePk: number;
  category: PickCategory;
  /** The model's "side" — what we're predicting will happen. */
  side: string;
  /** Numeric line for over/under markets, e.g. 8.5 */
  line?: number;
  /** Concrete prediction summary string for display. */
  prediction: string;
  /** Plain-English explanation. */
  explanation: string;
  /** 0–100 confidence score at pick time. */
  confidence: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  /** Underlying model probability if applicable (0–1). */
  probability?: number;
  /** Game label like "NYY @ BOS". */
  gameLabel: string;
  createdAt: number;
  // Filled in by grading
  result?: PickResult;
  actual?: string;
  gradedAt?: number;
};

export type DailyPicksSnapshot = {
  date: string;
  createdAt: number;
  picks: LoggedPick[];
};

const PICKS_KEY = (date: string) => `picks:${date}`;

/**
 * Build today's slate of picks from the opportunities engine and persist.
 * Idempotent on date — re-running won't double-log.
 *
 * Selects the top N opportunities (default 10) plus the highest-confidence
 * NRFI play and the lowest-confidence (i.e. best YRFI by inversion).
 */
export async function snapshotPicksForDate(date: string, opts?: { topN?: number }): Promise<DailyPicksSnapshot> {
  const existing = await getJson<DailyPicksSnapshot>(PICKS_KEY(date));
  if (existing) return existing;

  const insights = await buildSlateInsights(date);
  const topN = opts?.topN ?? 10;
  const top = insights.opportunities.slice(0, topN);

  const picks: LoggedPick[] = top.map((o, i) => {
    // Map opportunity category → pick category and concrete side
    const cat = mapCategory(o.category);
    const side = inferSide(o, cat);
    const line = inferLine(o, cat);
    return {
      id: `${date}:${o.gamePk}:${o.category}:${i}`,
      date,
      gamePk: o.gamePk,
      category: cat,
      side,
      line,
      prediction: o.prediction,
      explanation: o.explanation,
      confidence: o.confidenceScore,
      confidenceLevel: o.confidence,
      probability: o.probability,
      gameLabel: o.gameLabel,
      createdAt: Date.now(),
      result: 'pending',
    };
  });

  // Also auto-include the top-3 NRFI and top-3 YRFI from the F5 slate
  // (they're computed inside insights.games via the F5 model)
  const games = insights.games;
  const sortedNRFI = [...games].sort((a, b) => b.prediction.expectedTotal - a.prediction.expectedTotal);
  // NRFI plays = lowest expected total = highest P(NRFI). YRFI = inverse.
  // F5 NRFI is a separate read — we re-run F5 inside insights so we don't have direct pNRFI;
  // we'll grade the over/under run-total picks here and let the dedicated NRFI page handle its own log.

  const snap: DailyPicksSnapshot = { date, createdAt: Date.now(), picks };
  await setJson(PICKS_KEY(date), snap);
  return snap;
}

function mapCategory(c: string): PickCategory {
  switch (c) {
    case 'total-high':
    case 'shootout':
      return 'run-total-over';
    case 'total-low':
      return 'run-total-under';
    case 'mismatch':
      return 'home-ml'; // refined in inferSide
    case 'weather':
      return 'run-total-over';
    case 'k-matchup':
      return 'run-total-under';
    case 'park':
      return 'run-total-over';
    case 'travel':
      return 'away-ml';
    default:
      return 'run-total-over';
  }
}

function inferSide(o: any, cat: PickCategory): string {
  if (cat === 'home-ml' || cat === 'away-ml') {
    if (/road favorite/i.test(o.headline)) return 'AWAY ML';
    return 'HOME ML';
  }
  if (cat.endsWith('-over')) return 'OVER';
  if (cat.endsWith('-under')) return 'UNDER';
  return o.metric;
}

function inferLine(o: any, cat: PickCategory): number | undefined {
  if (cat === 'run-total-over' || cat === 'run-total-under') {
    // Try to extract from the prediction string e.g. "Expected total runs: 12.4 (...)"
    const m = /([0-9]+\.[0-9]+)/.exec(o.prediction);
    if (m) return parseFloat(m[1]);
  }
  return undefined;
}

/**
 * Grade all pending picks for a given date by fetching each game's final.
 * Idempotent — already-graded picks are skipped.
 */
export async function gradePicksForDate(date: string): Promise<DailyPicksSnapshot | null> {
  const snap = await getJson<DailyPicksSnapshot>(PICKS_KEY(date));
  if (!snap) return null;

  // Group picks by gamePk to minimize live-feed fetches
  const byGame = new Map<number, LoggedPick[]>();
  for (const p of snap.picks) {
    if (p.result && p.result !== 'pending') continue;
    if (!byGame.has(p.gamePk)) byGame.set(p.gamePk, []);
    byGame.get(p.gamePk)!.push(p);
  }

  const updated: LoggedPick[] = [...snap.picks];
  for (const [gamePk, picks] of byGame) {
    const live = await getGameLive(gamePk).catch(() => null);
    if (!live) continue;
    const status = live.gameData?.status?.abstractGameState;
    if (status !== 'Final') continue;

    const linescore = live.liveData?.linescore;
    const awayRuns = linescore?.teams?.away?.runs ?? 0;
    const homeRuns = linescore?.teams?.home?.runs ?? 0;
    const total = awayRuns + homeRuns;
    const innings = linescore?.innings ?? [];
    const firstInning = innings[0];
    const firstInningRuns = (firstInning?.away?.runs ?? 0) + (firstInning?.home?.runs ?? 0);
    const f5Innings = innings.slice(0, 5);
    const f5Runs = f5Innings.reduce((s: number, i: any) => s + (i?.away?.runs ?? 0) + (i?.home?.runs ?? 0), 0);

    for (const p of picks) {
      const idx = updated.findIndex((u) => u.id === p.id);
      const result = gradePick(p, { awayRuns, homeRuns, total, firstInningRuns, f5Runs });
      updated[idx] = {
        ...p,
        ...result,
        gradedAt: Date.now(),
      };
    }
  }

  const newSnap: DailyPicksSnapshot = { ...snap, picks: updated };
  await setJson(PICKS_KEY(date), newSnap);
  return newSnap;
}

function gradePick(
  p: LoggedPick,
  game: { awayRuns: number; homeRuns: number; total: number; firstInningRuns: number; f5Runs: number }
): { result: PickResult; actual: string } {
  switch (p.category) {
    case 'run-total-over': {
      if (p.line == null) return { result: 'no-action', actual: `${game.total} R` };
      if (game.total > p.line) return { result: 'win', actual: `${game.total} R` };
      if (game.total < p.line) return { result: 'loss', actual: `${game.total} R` };
      return { result: 'push', actual: `${game.total} R` };
    }
    case 'run-total-under': {
      if (p.line == null) return { result: 'no-action', actual: `${game.total} R` };
      if (game.total < p.line) return { result: 'win', actual: `${game.total} R` };
      if (game.total > p.line) return { result: 'loss', actual: `${game.total} R` };
      return { result: 'push', actual: `${game.total} R` };
    }
    case 'nrfi': {
      if (game.firstInningRuns === 0) return { result: 'win', actual: '0 R in 1st' };
      return { result: 'loss', actual: `${game.firstInningRuns} R in 1st` };
    }
    case 'yrfi': {
      if (game.firstInningRuns > 0) return { result: 'win', actual: `${game.firstInningRuns} R in 1st` };
      return { result: 'loss', actual: '0 R in 1st' };
    }
    case 'f5-over': {
      if (p.line == null) return { result: 'no-action', actual: `${game.f5Runs} R F5` };
      return { result: game.f5Runs > p.line ? 'win' : game.f5Runs < p.line ? 'loss' : 'push', actual: `${game.f5Runs} R F5` };
    }
    case 'f5-under': {
      if (p.line == null) return { result: 'no-action', actual: `${game.f5Runs} R F5` };
      return { result: game.f5Runs < p.line ? 'win' : game.f5Runs > p.line ? 'loss' : 'push', actual: `${game.f5Runs} R F5` };
    }
    case 'home-ml': {
      return { result: game.homeRuns > game.awayRuns ? 'win' : 'loss', actual: `${game.awayRuns}–${game.homeRuns}` };
    }
    case 'away-ml': {
      return { result: game.awayRuns > game.homeRuns ? 'win' : 'loss', actual: `${game.awayRuns}–${game.homeRuns}` };
    }
  }
}

export async function getPicksForDate(date: string): Promise<DailyPicksSnapshot | null> {
  return getJson<DailyPicksSnapshot>(PICKS_KEY(date));
}

export async function getAllPicksDates(): Promise<string[]> {
  const keys = await listByPrefix('picks:');
  return keys
    .map((k) => k.replace(/^picks:/, ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse(); // most recent first
}

export async function getAllGradedPicks(limit = 365): Promise<LoggedPick[]> {
  const dates = await getAllPicksDates();
  const slice = dates.slice(0, limit);
  const all: LoggedPick[] = [];
  for (const d of slice) {
    const snap = await getJson<DailyPicksSnapshot>(PICKS_KEY(d));
    if (snap) all.push(...snap.picks);
  }
  return all;
}

// ── Aggregation helpers for the track record page ───────────────────────────

export type Aggregate = {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  hitRate: number; // wins / (wins + losses)
  units: number;   // +1 per win, -1.1 per loss (-110 juice), 0 push
};

export function aggregate(picks: LoggedPick[]): Aggregate {
  let wins = 0, losses = 0, pushes = 0, pending = 0;
  for (const p of picks) {
    if (p.result === 'win') wins++;
    else if (p.result === 'loss') losses++;
    else if (p.result === 'push') pushes++;
    else pending++;
  }
  const decided = wins + losses;
  return {
    total: picks.length,
    wins,
    losses,
    pushes,
    pending,
    hitRate: decided > 0 ? wins / decided : 0,
    units: wins * 1 - losses * 1.1,
  };
}

export type CalibrationBucket = {
  bucket: string;
  range: [number, number];
  predicted: number; // mean predicted prob
  actual: number;    // empirical hit rate
  n: number;
};

/**
 * Calibration analysis on picks that have an underlying probability.
 * Buckets at 0.5–0.6, 0.6–0.7, 0.7–0.8, 0.8–0.9, 0.9–1.0.
 */
export function calibration(picks: LoggedPick[]): CalibrationBucket[] {
  const buckets: { range: [number, number]; label: string }[] = [
    { range: [0.5, 0.6], label: '50–60%' },
    { range: [0.6, 0.7], label: '60–70%' },
    { range: [0.7, 0.8], label: '70–80%' },
    { range: [0.8, 0.9], label: '80–90%' },
    { range: [0.9, 1.0], label: '90–100%' },
  ];
  return buckets.map((b) => {
    const inB = picks.filter(
      (p) => p.probability != null && p.probability >= b.range[0] && p.probability < b.range[1] &&
        (p.result === 'win' || p.result === 'loss')
    );
    const wins = inB.filter((p) => p.result === 'win').length;
    const meanPredicted = inB.length > 0 ? inB.reduce((s, p) => s + (p.probability ?? 0), 0) / inB.length : 0;
    return {
      bucket: b.label,
      range: b.range,
      predicted: meanPredicted,
      actual: inB.length > 0 ? wins / inB.length : 0,
      n: inB.length,
    };
  });
}

export function aggregateByConfidence(picks: LoggedPick[]): Record<string, Aggregate> {
  const out: Record<string, Aggregate> = {};
  for (const level of ['high', 'medium', 'low'] as const) {
    out[level] = aggregate(picks.filter((p) => p.confidenceLevel === level));
  }
  return out;
}

export function aggregateByCategory(picks: LoggedPick[]): Record<string, Aggregate> {
  const out: Record<string, Aggregate> = {};
  for (const p of picks) {
    if (!out[p.category]) {
      out[p.category] = { total: 0, wins: 0, losses: 0, pushes: 0, pending: 0, hitRate: 0, units: 0 };
    }
  }
  for (const cat of Object.keys(out)) {
    out[cat] = aggregate(picks.filter((p) => p.category === cat));
  }
  return out;
}
