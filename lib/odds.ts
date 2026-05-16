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
    let mlHomePrices: number[] = [];
    let mlAwayPrices: number[] = [];
    let totalLines: number[] = [];
    let overPrices: number[] = [];
    let underPrices: number[] = [];
    let rlHomePoints: number[] = [];
    let rlHomePrices: number[] = [];
    let rlAwayPoints: number[] = [];
    let rlAwayPrices: number[] = [];

    for (const bk of event.bookmakers ?? []) {
      for (const m of bk.markets ?? []) {
        if (m.key === 'h2h') {
          for (const o of m.outcomes ?? []) {
            if (o.name === homeName && typeof o.price === 'number') mlHomePrices.push(o.price);
            else if (o.name === awayName && typeof o.price === 'number') mlAwayPrices.push(o.price);
          }
        } else if (m.key === 'totals') {
          // Look for the median total line offered
          for (const o of m.outcomes ?? []) {
            if (typeof o.point === 'number') {
              if (!totalLines.includes(o.point)) totalLines.push(o.point);
              if (o.name === 'Over') overPrices.push(o.price);
              else if (o.name === 'Under') underPrices.push(o.price);
            }
          }
        } else if (m.key === 'spreads') {
          for (const o of m.outcomes ?? []) {
            if (typeof o.point !== 'number' || typeof o.price !== 'number') continue;
            if (o.name === homeName) {
              rlHomePoints.push(o.point);
              rlHomePrices.push(o.price);
            } else if (o.name === awayName) {
              rlAwayPoints.push(o.point);
              rlAwayPrices.push(o.price);
            }
          }
        }
      }
    }

    out.set(key, {
      homeName,
      awayName,
      commenceIso: event.commence_time,
      ml: mlHomePrices.length && mlAwayPrices.length
        ? { home: median(mlHomePrices), away: median(mlAwayPrices) }
        : null,
      totals: totalLines.length && overPrices.length && underPrices.length
        ? {
            line: median(totalLines),
            overPrice: median(overPrices),
            underPrice: median(underPrices),
          }
        : null,
      runLine: rlHomePoints.length && rlAwayPoints.length
        ? {
            homePoint: median(rlHomePoints),
            homePrice: median(rlHomePrices),
            awayPoint: median(rlAwayPoints),
            awayPrice: median(rlAwayPrices),
          }
        : null,
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
