/**
 * Sabermetric calculations.
 *
 * Every formula here cites its source. These are derived metrics computed from
 * counting stats — they are not the same as the model-fit versions Fangraphs
 * publishes (which use park/league-adjusted run values that update yearly).
 *
 * For league-adjusted metrics (wRC+, OPS+, ERA-) we'd need a league-context
 * table per season; that's a TODO once we ingest historical league totals.
 */

const n = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0;
  const x = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
};

// ── Hitting ─────────────────────────────────────────────────────────────────

/**
 * On-base percentage.
 * Source: MLB rulebook. OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
 */
export function obp(s: Record<string, any>): number {
  const num = n(s.hits) + n(s.baseOnBalls) + n(s.hitByPitch);
  const den = n(s.atBats) + n(s.baseOnBalls) + n(s.hitByPitch) + n(s.sacFlies);
  return den ? num / den : 0;
}

/**
 * Slugging percentage. SLG = TB / AB
 * TB = 1B + 2*2B + 3*3B + 4*HR
 */
export function slg(s: Record<string, any>): number {
  const ab = n(s.atBats);
  if (!ab) return 0;
  const singles = n(s.hits) - n(s.doubles) - n(s.triples) - n(s.homeRuns);
  const tb = singles + 2 * n(s.doubles) + 3 * n(s.triples) + 4 * n(s.homeRuns);
  return tb / ab;
}

/**
 * Isolated power. ISO = SLG - AVG
 * Source: Bill James.
 */
export function iso(s: Record<string, any>): number {
  const avg = n(s.atBats) ? n(s.hits) / n(s.atBats) : 0;
  return slg(s) - avg;
}

/**
 * BABIP. (H - HR) / (AB - K - HR + SF)
 * Source: Voros McCracken.
 */
export function babip(s: Record<string, any>): number {
  const num = n(s.hits) - n(s.homeRuns);
  const den = n(s.atBats) - n(s.strikeOuts) - n(s.homeRuns) + n(s.sacFlies);
  return den > 0 ? num / den : 0;
}

/**
 * wOBA — Weighted On-Base Average.
 * Source: Tom Tango, "The Book." Uses static linear weights — the precise
 * weights are recalculated yearly by Fangraphs. We use 2023–2024 average
 * weights as a stable approximation. Real model would lookup by season.
 *
 * Reference weights (Fangraphs guts table, recent seasons):
 *   uBB=0.696, HBP=0.728, 1B=0.883, 2B=1.244, 3B=1.569, HR=2.004
 */
export const WOBA_WEIGHTS = {
  uBB: 0.696,
  HBP: 0.728,
  '1B': 0.883,
  '2B': 1.244,
  '3B': 1.569,
  HR: 2.004,
} as const;

export function woba(s: Record<string, any>): number {
  const bb = n(s.baseOnBalls);
  const ibb = n(s.intentionalWalks);
  const ubb = Math.max(0, bb - ibb);
  const hbp = n(s.hitByPitch);
  const hr = n(s.homeRuns);
  const triples = n(s.triples);
  const doubles = n(s.doubles);
  const singles = n(s.hits) - doubles - triples - hr;
  const num =
    WOBA_WEIGHTS.uBB * ubb +
    WOBA_WEIGHTS.HBP * hbp +
    WOBA_WEIGHTS['1B'] * singles +
    WOBA_WEIGHTS['2B'] * doubles +
    WOBA_WEIGHTS['3B'] * triples +
    WOBA_WEIGHTS.HR * hr;
  const den = n(s.atBats) + bb - ibb + n(s.sacFlies) + hbp;
  return den ? num / den : 0;
}

/** Strikeout rate — K / PA */
export function kRate(s: Record<string, any>): number {
  const pa = n(s.plateAppearances);
  return pa ? n(s.strikeOuts) / pa : 0;
}

/** Walk rate — BB / PA */
export function bbRate(s: Record<string, any>): number {
  const pa = n(s.plateAppearances);
  return pa ? n(s.baseOnBalls) / pa : 0;
}

// ── Pitching ────────────────────────────────────────────────────────────────

/**
 * FIP — Fielding Independent Pitching.
 * Source: Tom Tango. FIP = ((13*HR + 3*(BB+HBP) - 2*K) / IP) + FIP_CONSTANT
 * FIP constant varies year to year; we use 3.10 as a stable approximation.
 */
export const FIP_CONSTANT = 3.10;

export function fip(s: Record<string, any>): number {
  const ip = parseInnings(s.inningsPitched);
  if (!ip) return 0;
  const hr = n(s.homeRuns);
  const bb = n(s.baseOnBalls);
  const hbp = n(s.hitByPitch);
  const k = n(s.strikeOuts);
  return (13 * hr + 3 * (bb + hbp) - 2 * k) / ip + FIP_CONSTANT;
}

/** WHIP — (BB + H) / IP */
export function whip(s: Record<string, any>): number {
  const ip = parseInnings(s.inningsPitched);
  if (!ip) return 0;
  return (n(s.baseOnBalls) + n(s.hits)) / ip;
}

/** K/9 — (K * 9) / IP */
export function k9(s: Record<string, any>): number {
  const ip = parseInnings(s.inningsPitched);
  return ip ? (n(s.strikeOuts) * 9) / ip : 0;
}

/** BB/9 — (BB * 9) / IP */
export function bb9(s: Record<string, any>): number {
  const ip = parseInnings(s.inningsPitched);
  return ip ? (n(s.baseOnBalls) * 9) / ip : 0;
}

/** HR/9 — (HR * 9) / IP */
export function hr9(s: Record<string, any>): number {
  const ip = parseInnings(s.inningsPitched);
  return ip ? (n(s.homeRuns) * 9) / ip : 0;
}

/**
 * IP comes from MLB API as "121.1" meaning 121 and 1/3 innings.
 * Parse the decimal as thirds.
 */
export function parseInnings(ip: unknown): number {
  if (ip === undefined || ip === null || ip === '') return 0;
  const s = String(ip);
  const dot = s.indexOf('.');
  if (dot === -1) return parseFloat(s) || 0;
  const whole = parseInt(s.slice(0, dot), 10) || 0;
  const frac = parseInt(s.slice(dot + 1), 10) || 0;
  return whole + frac / 3;
}

// ── Team-level ──────────────────────────────────────────────────────────────

/**
 * Pythagorean expected winning percentage.
 * Source: Bill James, with 1.83 exponent (Pythagenpat-equivalent in practice).
 */
export function pythagorean(runsScored: number, runsAllowed: number, exp = 1.83): number {
  const rs = runsScored ** exp;
  const ra = runsAllowed ** exp;
  return rs + ra > 0 ? rs / (rs + ra) : 0;
}

export function expectedRecord(rs: number, ra: number, games: number) {
  const pct = pythagorean(rs, ra);
  const wins = Math.round(pct * games);
  return { wins, losses: games - wins, pct };
}

// ── Formatters ──────────────────────────────────────────────────────────────

export function fmtAvg(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '.000';
  return v.toFixed(3).replace(/^0\./, '.');
}

export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtSigned(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(digits);
}
