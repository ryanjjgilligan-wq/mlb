/**
 * League-context-adjusted stats.
 *
 *   wRC+   = ((wRAA / PA + lgR/PA) + (lgR/PA - parkFactor*lgR/PA)) / (lgR/PA without pitchers) * 100
 *   OPS+   = 100 * (OBP/lgOBP + SLG/lgSLG - 1)
 *   ERA-   = 100 * ERA / (lgERA * parkRunsFactor)
 *
 * For our purposes we use the simplified canonical formulas:
 *
 *   wRC+   = 100 * ((wOBA - lgWOBA) / wOBAScale + lgR/PA) / (lgR/PA)
 *   OPS+   = 100 * (OBP/lgOBP + SLG/lgSLG - 1)
 *   ERA-   = 100 * (ERA / lgERA)
 *
 * Park-adjusted versions multiply by 100/parkRunsFactor (pitcher) or
 * /(parkRunsFactor) (hitter) — applied only when a known park profile
 * is supplied.
 *
 * Sources: Tom Tango wOBA framework; Fangraphs glossary entries for
 * wRC+, OPS+, ERA−.
 */

import { woba, obp, slg } from './saber';

export type LeagueCtx = {
  lgWOBA: number;
  lgOBP: number;
  lgSLG: number;
  lgERA: number;
  runsPerPA: number;
  wOBAScale: number;
};

export function wRCPlus(stat: Record<string, any>, ctx: LeagueCtx, parkRunsFactor?: number): number {
  const w = woba(stat);
  const wRAAPerPA = (w - ctx.lgWOBA) / ctx.wOBAScale;
  const total = wRAAPerPA + ctx.runsPerPA;
  const denom = ctx.runsPerPA;
  if (denom <= 0) return 100;
  let raw = (total / denom) * 100;
  if (parkRunsFactor && parkRunsFactor > 0) {
    raw *= (100 / parkRunsFactor);
  }
  return raw;
}

export function opsPlus(stat: Record<string, any>, ctx: LeagueCtx): number {
  const o = obp(stat);
  const s = slg(stat);
  if (ctx.lgOBP <= 0 || ctx.lgSLG <= 0) return 100;
  return 100 * (o / ctx.lgOBP + s / ctx.lgSLG - 1);
}

export function eraMinus(era: number, ctx: LeagueCtx, parkRunsFactor?: number): number {
  if (!ctx.lgERA || !Number.isFinite(era)) return 100;
  let val = (era / ctx.lgERA) * 100;
  if (parkRunsFactor && parkRunsFactor > 0) {
    val *= (100 / parkRunsFactor);
  }
  return val;
}
