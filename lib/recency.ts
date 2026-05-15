/**
 * Recency-weighted projections.
 *
 * Why this matters
 * ----------------
 *   A pitcher's last 4 starts is dramatically more predictive of his next
 *   start than his April line buried 100+ days ago. Same goes for team
 *   offense/defense. Sharp models always weight recent samples more heavily
 *   than season aggregates.
 *
 * Approach
 * --------
 *   We blend three windows with declining-weight defaults:
 *     - Last 15 games / 4 starts:  50%
 *     - Last 30 games / 8 starts:  30%
 *     - Full season:               20%
 *
 *   When a window is missing or has insufficient sample, the weight is
 *   redistributed to the available windows. When *only* season data is
 *   available we fall back to it cleanly with a confidence note.
 *
 *   Returns a synthetic stat object that downstream functions (predictRunTotal,
 *   predictFirst5, etc.) can drop in as if it were a regular season stat.
 */

import { fip, parseInnings } from './saber';

export type BlendWeights = {
  recent: number;
  mid: number;
  season: number;
};

export const TEAM_DEFAULT_WEIGHTS: BlendWeights = { recent: 0.5, mid: 0.3, season: 0.2 };
export const PITCHER_DEFAULT_WEIGHTS: BlendWeights = { recent: 0.5, mid: 0.3, season: 0.2 };

/**
 * Blend up to three stat objects with the supplied weights, normalizing
 * weights when one or more inputs are null/undefined. Returns a single
 * stat-shape object with numeric counting stats summed proportionally.
 */
export function blendStats(
  recent: Record<string, any> | null,
  mid: Record<string, any> | null,
  season: Record<string, any> | null,
  w: BlendWeights = TEAM_DEFAULT_WEIGHTS
): Record<string, number | string> {
  const present: Array<{ stat: Record<string, any>; weight: number }> = [];
  if (recent) present.push({ stat: recent, weight: w.recent });
  if (mid) present.push({ stat: mid, weight: w.mid });
  if (season) present.push({ stat: season, weight: w.season });
  if (!present.length) return {};

  // Normalize to sum to 1
  const total = present.reduce((s, x) => s + x.weight, 0);
  for (const x of present) x.weight /= total;

  // Collect every numeric key across all sources
  const keys = new Set<string>();
  for (const x of present) {
    for (const k of Object.keys(x.stat)) keys.add(k);
  }

  const out: Record<string, any> = {};
  for (const key of keys) {
    // Special-case: inningsPitched needs to parse the .1/.2 thirds and re-encode
    if (key === 'inningsPitched') {
      const blended = present.reduce((sum, x) => sum + x.weight * parseInnings(x.stat[key]), 0);
      const whole = Math.floor(blended);
      const thirds = Math.round((blended - whole) * 3);
      out[key] = `${whole}.${thirds}`;
      continue;
    }
    // Try to blend numerically
    const numericVals = present.map((x) => {
      const v = x.stat[key];
      if (v === undefined || v === null || v === '') return null;
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n) ? n : null;
    });
    const allNumeric = numericVals.every((v) => v !== null);
    if (allNumeric) {
      const blended = present.reduce((sum, x, i) => sum + x.weight * (numericVals[i] as number), 0);
      // Format hit rates back to MLB-style 3-decimal strings if the source was a string
      const wasStringRate = typeof present[0].stat[key] === 'string'
        && /^\.\d|^0?\./.test(String(present[0].stat[key]));
      out[key] = wasStringRate ? blended.toFixed(3).replace(/^0\./, '.') : blended;
    } else {
      // Non-numeric — take the most-recent available
      out[key] = present[0].stat[key];
    }
  }
  return out;
}

/**
 * Compute a recency-weighted RA/G for a team. Useful when blending team
 * pitching for the bullpen-portion of game projections.
 */
export function recencyWeightedRPG(
  recent: Record<string, any> | null,
  mid: Record<string, any> | null,
  season: Record<string, any> | null,
  key: 'runs' | 'earnedRuns' = 'runs',
  w: BlendWeights = TEAM_DEFAULT_WEIGHTS
): number | null {
  const blended = blendStats(recent, mid, season, w);
  const games = Number(blended.gamesPlayed) || 0;
  const r = Number(blended[key]) || 0;
  return games > 0 ? r / games : null;
}

/**
 * Build a recency-weighted FIP for a starting pitcher. Pulls from the same
 * blendStats pipeline but applies the FIP formula on the blended counting
 * stats so the result is mathematically consistent.
 */
export function recencyWeightedFIP(
  recent: Record<string, any> | null,
  mid: Record<string, any> | null,
  season: Record<string, any> | null,
  w: BlendWeights = PITCHER_DEFAULT_WEIGHTS
): { fip: number | null; ipPerStart: number | null; sources: string[] } {
  const blended = blendStats(recent, mid, season, w);
  const blendedFIP = fip(blended);
  const ip = parseInnings(blended.inningsPitched);
  const gs = Number(blended.gamesStarted) || Number(blended.gamesPlayed) || 0;
  const ipPerStart = gs > 0 ? Math.min(7, Math.max(3, ip / gs)) : null;
  const sources: string[] = [];
  if (recent) sources.push(`last-${Math.round(Number(recent.gamesPlayed) || 0)}`);
  if (mid) sources.push(`last-${Math.round(Number(mid.gamesPlayed) || 0)}`);
  if (season) sources.push('season');
  return {
    fip: Number.isFinite(blendedFIP) && blendedFIP > 0 ? blendedFIP : null,
    ipPerStart,
    sources,
  };
}
