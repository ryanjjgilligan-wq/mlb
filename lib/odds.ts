/**
 * Live MLB market odds via The Odds API.
 *
 * Configuration
 * -------------
 *   Set ODDS_API_KEY env var to enable. Free tier at https://the-odds-api.com
 *   gives 500 requests/month — more than enough for daily MLB at our
 *   revalidation cadence (30 min cache → ~50 req/day at most).
 *
 * Without the key the module returns null and Results falls back to fair
 * model odds. With the key, every pick on /results shows the real market
 * line + implied probability + edge in percentage points.
 */

const ODDS_BASE = 'https://api.the-odds-api.com/v4';

export type MarketOddsForGame = {
  homeName: string;
  awayName: string;
  commenceIso: string;
  /** Best (most favorable to bettor) prices across surveyed books. */
  ml: { home: number; away: number } | null;
  totals: { line: number; overPrice: number; underPrice: number } | null;
  runLine: { homePoint: number; homePrice: number; awayPoint: number; awayPrice: number } | null;
  /** How many bookmakers we consensus'd across (0 if odds not yet posted). */
  bookCount: number;
};

// SECURITY NOTE: this key is a hardcoded fallback because the Vercel env var
// wasn't being picked up. Rotate this key on the-odds-api.com and remove this
// fallback as soon as ODDS_API_KEY is wired up properly in the dashboard.
const FALLBACK_ODDS_KEY = '8b05d78a838b0617be03c7afd67f501d';

export async function getMarketOdds(): Promise<Map<string, MarketOddsForGame> | null> {
  const apiKey = process.env.ODDS_API_KEY || FALLBACK_ODDS_KEY;
  if (!apiKey) return null;

  const url = `${ODDS_BASE}/sports/baseball_mlb/odds?regions=us&markets=h2h,totals,spreads&oddsFormat=american&apiKey=${apiKey}`;
  let raw: any[];
  try {
    const res = await fetch(url, { next: { revalidate: 1800, tags: ['odds'] } });
    if (!res.ok) return null;
    raw = await res.json();
  } catch {
    return null;
  }

  const out = new Map<string, MarketOddsForGame>();
  for (const event of raw ?? []) {
    if (!event.home_team || !event.away_team) continue;
    const homeName = event.home_team as string;
    const awayName = event.away_team as string;
    const key = matchupKey(awayName, homeName);

    // For each market type, take the BEST (most favorable) price across books.
    // For an over/under or ML, "best" depends on the side — but for a single
    // consensus number we just take the median to avoid book-specific noise.
    const mlHomePrices: number[] = [];
    const mlAwayPrices: number[] = [];
    // For totals + spreads, group prices BY THE POINT they're attached to.
    // Books offer alt lines (e.g. totals at 7.5/8/8.5) and lumping prices
    // across different points produces a meaningless "median" price.
    const overByLine = new Map<number, number[]>();
    const underByLine = new Map<number, number[]>();
    const rlHomeByPoint = new Map<number, number[]>();
    const rlAwayByPoint = new Map<number, number[]>();

    for (const bk of event.bookmakers ?? []) {
      for (const m of bk.markets ?? []) {
        if (m.key === 'h2h') {
          for (const o of m.outcomes ?? []) {
            if (o.name === homeName && typeof o.price === 'number') mlHomePrices.push(o.price);
            else if (o.name === awayName && typeof o.price === 'number') mlAwayPrices.push(o.price);
          }
        } else if (m.key === 'totals') {
          for (const o of m.outcomes ?? []) {
            if (typeof o.point !== 'number' || typeof o.price !== 'number') continue;
            const bucket = o.name === 'Over' ? overByLine : o.name === 'Under' ? underByLine : null;
            if (!bucket) continue;
            const arr = bucket.get(o.point) ?? [];
            arr.push(o.price);
            bucket.set(o.point, arr);
          }
        } else if (m.key === 'spreads') {
          for (const o of m.outcomes ?? []) {
            if (typeof o.point !== 'number' || typeof o.price !== 'number') continue;
            const bucket = o.name === homeName ? rlHomeByPoint : o.name === awayName ? rlAwayByPoint : null;
            if (!bucket) continue;
            const arr = bucket.get(o.point) ?? [];
            arr.push(o.price);
            bucket.set(o.point, arr);
          }
        }
      }
    }

    // Consensus totals line = the point offered by the MOST books (modal),
    // then median price at that specific line.
    let totals: { line: number; overPrice: number; underPrice: number } | null = null;
    const totalLinePoints = new Set([...overByLine.keys(), ...underByLine.keys()]);
    if (totalLinePoints.size > 0) {
      let bestLine = -1;
      let bestCount = 0;
      for (const line of totalLinePoints) {
        const count = (overByLine.get(line)?.length ?? 0) + (underByLine.get(line)?.length ?? 0);
        if (count > bestCount) { bestCount = count; bestLine = line; }
      }
      const overs = overByLine.get(bestLine) ?? [];
      const unders = underByLine.get(bestLine) ?? [];
      if (overs.length > 0 && unders.length > 0) {
        totals = { line: bestLine, overPrice: median(overs), underPrice: median(unders) };
      }
    }

    // Run line: prefer the standard ±1.5; fall back to the modal point if 1.5
    // isn't quoted by enough books.
    let runLine: { homePoint: number; homePrice: number; awayPoint: number; awayPrice: number } | null = null;
    const homePoints = [...rlHomeByPoint.keys()];
    if (homePoints.length > 0) {
      let homePoint = -1.5;
      if (!rlHomeByPoint.has(-1.5) || (rlHomeByPoint.get(-1.5)?.length ?? 0) < 2) {
        // pick modal home point
        let bestCount = 0;
        for (const p of homePoints) {
          const c = rlHomeByPoint.get(p)?.length ?? 0;
          if (c > bestCount) { bestCount = c; homePoint = p; }
        }
      }
      const awayPoint = -homePoint;
      const homePrices = rlHomeByPoint.get(homePoint) ?? [];
      const awayPrices = rlAwayByPoint.get(awayPoint) ?? [];
      if (homePrices.length > 0 && awayPrices.length > 0) {
        runLine = {
          homePoint,
          homePrice: median(homePrices),
          awayPoint,
          awayPrice: median(awayPrices),
        };
      }
    }

    out.set(key, {
      homeName,
      awayName,
      commenceIso: event.commence_time,
      ml: mlHomePrices.length && mlAwayPrices.length
        ? { home: median(mlHomePrices), away: median(mlAwayPrices) }
        : null,
      totals,
      runLine,
      bookCount: event.bookmakers?.length ?? 0,
    });
  }

  return out;
}

/**
 * Canonical key for matching a game across the MLB API and Odds API.
 * Both sources use the format "City TeamName" (e.g. "Pittsburgh Pirates"),
 * so we just normalize whitespace + case and order by away then home.
 */
export function matchupKey(awayName: string, homeName: string): string {
  return `${normalize(awayName)}|${normalize(homeName)}`;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function isOddsConfigured(): boolean {
  return !!(process.env.ODDS_API_KEY || FALLBACK_ODDS_KEY);
}
