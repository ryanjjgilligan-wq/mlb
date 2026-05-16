/**
 * Opportunity insights — surfaces the most notable things about today's slate.
 *
 * Computes the same run-total predictor each game page uses, then categorizes
 * notables across the full slate (highest totals, biggest weather impact,
 * K matchups, talent mismatches, etc.). Designed to be a curated,
 * scannable analyst checklist rather than an exhaustive dump.
 */

import {
  getSchedule,
  getStandings,
  getGameLive,
  getPlayerSeasonStats,
  getLastGameForTeam,
  getTeamLastXGamesHitting,
  getTeamLastXGamesPitching,
  getPlayerLastXGames,
  type ScheduleGame,
} from './mlb';
import { getPark, haversineMiles } from './parks';
import { fip, parseInnings } from './saber';
import { blendStats, recencyWeightedFIP } from './recency';
import {
  predictRunTotal,
  type RunTotalInput,
  type RunTotalOutput,
  type WeatherInput,
} from './predict';
import { ymd } from './time';

export type GameStatus = 'preview' | 'live' | 'final';

export type GameInsight = {
  gamePk: number;
  away: { id: number; name: string; abbr?: string };
  home: { id: number; name: string; abbr?: string };
  gameDate: string;
  status: GameStatus;
  venueId?: number;
  venueName?: string;
  weather?: WeatherInput;
  prediction: RunTotalOutput;
  awayStarter?: { id: number; name: string; k9?: number };
  homeStarter?: { id: number; name: string; k9?: number };
  awayTravelMiles: number;
  /** Live/final actuals — undefined for preview games. */
  actual?: {
    awayRuns: number;
    homeRuns: number;
    total: number;
    inningsCompleted: number;
    /** Sum of runs scored across innings 1–5 (partial if mid-game). */
    f5Runs: number;
    f5Complete: boolean;
    /** Runs in the first inning (both halves). */
    firstInningRuns: number;
    firstInningComplete: boolean;
    /** Actual strikeouts thrown by each starter (when known). */
    awayStarterKs?: number;
    homeStarterKs?: number;
  };
};

export type OpportunityResult = 'pending' | 'live' | 'hit' | 'miss' | 'push' | 'no-grade';

export type Opportunity = {
  category: 'total-high' | 'total-low' | 'weather' | 'k-matchup' | 'mismatch' | 'park' | 'travel' | 'shootout';
  headline: string;
  subline: string;
  metric: string;
  explanation: string;
  prediction: string;
  firstPitch: string;
  gamePk: number;
  gameLabel: string;
  importance: number;
  confidence: 'low' | 'medium' | 'high';
  confidenceScore: number;
  confidenceReasons: string[];
  probability?: number;
  /** Game status at the time of building. Drives result color/badge. */
  status: GameStatus;
  /** Outcome graded against actual game state (or 'pending' if preview). */
  result: OpportunityResult;
  /** Plain-language actual outcome to display alongside the prediction. */
  actualText?: string;
};

export async function buildSlateInsights(date?: string): Promise<{
  date: string;
  games: GameInsight[];
  opportunities: Opportunity[];
}> {
  const d = date ?? ymd();
  const schedule = await getSchedule(d).catch(() => []);
  // Include ALL games (preview, live, final) — predictions persist with
  // grading until the date rolls over.
  const games = schedule[0]?.games ?? [];
  if (!games.length) {
    return { date: d, games: [], opportunities: [] };
  }
  const standings = await getStandings().catch(() => []);
  const allRecords = standings.flatMap((s) => s.teamRecords);

  const insights = await Promise.all(games.map((g) => buildGameInsight(g, d, allRecords)));
  const valid = insights.filter((i): i is GameInsight => i !== null);

  const opportunities = generateOpportunities(valid);

  return { date: d, games: valid, opportunities };
}

async function buildGameInsight(
  game: ScheduleGame,
  date: string,
  allRecords: any[]
): Promise<GameInsight | null> {
  const home = game.teams.home.team;
  const away = game.teams.away.team;

  const [
    feed, awayLast,
    awayStarterStats, homeStarterStats,
    awayStarterLast4, homeStarterLast4,
    awayHitL15, awayHitL30, awayPitL15, awayPitL30,
    homeHitL15, homeHitL30, homePitL15, homePitL30,
  ] = await Promise.all([
    getGameLive(game.gamePk).catch(() => null),
    getLastGameForTeam(away.id, date).catch(() => null),
    game.teams.away.probablePitcher?.id
      ? getPlayerSeasonStats(game.teams.away.probablePitcher.id, 'pitching').catch(() => null)
      : Promise.resolve(null),
    game.teams.home.probablePitcher?.id
      ? getPlayerSeasonStats(game.teams.home.probablePitcher.id, 'pitching').catch(() => null)
      : Promise.resolve(null),
    game.teams.away.probablePitcher?.id
      ? getPlayerLastXGames(game.teams.away.probablePitcher.id, 'pitching', 4).catch(() => null)
      : Promise.resolve(null),
    game.teams.home.probablePitcher?.id
      ? getPlayerLastXGames(game.teams.home.probablePitcher.id, 'pitching', 4).catch(() => null)
      : Promise.resolve(null),
    getTeamLastXGamesHitting(away.id, 15).catch(() => null),
    getTeamLastXGamesHitting(away.id, 30).catch(() => null),
    getTeamLastXGamesPitching(away.id, 15).catch(() => null),
    getTeamLastXGamesPitching(away.id, 30).catch(() => null),
    getTeamLastXGamesHitting(home.id, 15).catch(() => null),
    getTeamLastXGamesHitting(home.id, 30).catch(() => null),
    getTeamLastXGamesPitching(home.id, 15).catch(() => null),
    getTeamLastXGamesPitching(home.id, 30).catch(() => null),
  ]);

  if (!feed) return null;

  const venueId = feed.gameData?.venue?.id ?? game.venue?.id;
  const park = getPark(venueId);

  const wxRaw = feed.gameData?.weather ?? {};
  const weather: WeatherInput = {
    tempF: wxRaw.temp ? parseInt(wxRaw.temp, 10) : undefined,
    windSpeedMph: wxRaw.wind ? parseInt(wxRaw.wind, 10) : undefined,
    windDir: wxRaw.wind,
    condition: wxRaw.condition,
  };

  const awayPrevPark = awayLast?.venue?.id ? getPark(awayLast.venue.id) : park;
  const awayTravelMiles = haversineMiles(awayPrevPark, park);

  const awayRec = allRecords.find((r) => r.team.id === away.id);
  const homeRec = allRecords.find((r) => r.team.id === home.id);
  const teamRate = (rec: any, key: 'runsScored' | 'runsAllowed') => {
    if (!rec) return 4.5;
    const games = rec.wins + rec.losses;
    return games > 0 ? (rec[key] ?? 0) / games : 4.5;
  };

  // Recency-blended team rates
  const seasonOff = (rec: any) => rec ? { runs: rec.runsScored ?? 0, gamesPlayed: rec.wins + rec.losses } : null;
  const seasonDef = (rec: any) => rec ? { runs: rec.runsAllowed ?? 0, gamesPlayed: rec.wins + rec.losses } : null;
  const blendRPG = (l15: any, l30: any, season: any): number | null => {
    const b = blendStats(l15, l30, season);
    const g = Number(b.gamesPlayed) || 0;
    const r = Number(b.runs) || 0;
    return g > 0 ? r / g : null;
  };

  const homeRS = blendRPG(homeHitL15, homeHitL30, seasonOff(homeRec)) ?? teamRate(homeRec, 'runsScored');
  const awayRS = blendRPG(awayHitL15, awayHitL30, seasonOff(awayRec)) ?? teamRate(awayRec, 'runsScored');
  const homeRA = blendRPG(homePitL15, homePitL30, seasonDef(homeRec)) ?? teamRate(homeRec, 'runsAllowed');
  const awayRA = blendRPG(awayPitL15, awayPitL30, seasonDef(awayRec)) ?? teamRate(awayRec, 'runsAllowed');

  const starterInput = (season: any, last4: any) => {
    if (!season?.stat && !last4) return undefined;
    if (last4) {
      const blended = recencyWeightedFIP(last4, null, season?.stat ?? null);
      if (blended.fip != null) return { fip: blended.fip, ipPerStart: blended.ipPerStart ?? 5.5 };
    }
    if (!season?.stat) return undefined;
    const computedFip = fip(season.stat);
    const ip = parseInnings(season.stat.inningsPitched);
    const gs = Number(season.stat.gamesStarted) || Number(season.stat.gamesPlayed) || 1;
    return {
      fip: Number.isFinite(computedFip) && computedFip > 0 ? computedFip : undefined,
      ipPerStart: gs > 0 ? Math.min(7, Math.max(3, ip / gs)) : 5.5,
    };
  };

  const input: RunTotalInput = {
    home: { teamId: home.id, runsScoredPerGame: homeRS, runsAllowedPerGame: homeRA },
    away: { teamId: away.id, runsScoredPerGame: awayRS, runsAllowedPerGame: awayRA },
    homeStarter: starterInput(homeStarterStats, homeStarterLast4),
    awayStarter: starterInput(awayStarterStats, awayStarterLast4),
    park,
    weather,
    travel: { awayTravelMiles, awayDaysRest: undefined, homeDaysRest: undefined },
  };
  const prediction = predictRunTotal(input);

  const k9From = (sp: any): number | undefined => {
    if (!sp?.stat) return undefined;
    const ip = parseInnings(sp.stat.inningsPitched);
    const k = Number(sp.stat.strikeOuts) || 0;
    return ip > 0 ? (k * 9) / ip : undefined;
  };

  // Extract actual state from the live feed
  const abstractState = game.status.abstractGameState as string;
  const status: GameStatus = abstractState === 'Final' ? 'final' : abstractState === 'Live' ? 'live' : 'preview';
  let actual: GameInsight['actual'];
  if (status !== 'preview') {
    const ls = feed.liveData?.linescore;
    const innings: any[] = ls?.innings ?? [];
    const awayRuns = ls?.teams?.away?.runs ?? 0;
    const homeRuns = ls?.teams?.home?.runs ?? 0;
    const total = awayRuns + homeRuns;
    const f5Innings = innings.slice(0, 5);
    const f5Runs = f5Innings.reduce((s, i) => s + (i?.away?.runs ?? 0) + (i?.home?.runs ?? 0), 0);
    const currentInning = ls?.currentInning ?? 0;
    const isTopInning = !!ls?.isTopInning;
    const outs = ls?.outs ?? 0;
    const f5Complete = status === 'final' || currentInning > 5 || (currentInning === 5 && !isTopInning && outs >= 3);
    const firstInningComplete = status === 'final' || currentInning > 1 || (currentInning === 1 && !isTopInning && outs >= 3);
    const firstInning = innings.find((i: any) => i.num === 1);
    const firstInningRuns = (firstInning?.away?.runs ?? 0) + (firstInning?.home?.runs ?? 0);
    const inningsCompleted = innings.filter((i: any) => i?.away?.runs !== undefined && i?.home?.runs !== undefined).length;

    // Starter actual K counts — pulled from the boxscore when each starter's
    // pitching line is available. Useful for grading pitcher-K props.
    const boxscore = feed.liveData?.boxscore;
    const awayStarterId = game.teams.away.probablePitcher?.id;
    const homeStarterId = game.teams.home.probablePitcher?.id;
    const awayStarterKs = awayStarterId
      ? Number(boxscore?.teams?.away?.players?.[`ID${awayStarterId}`]?.stats?.pitching?.strikeOuts ?? 0)
      : undefined;
    const homeStarterKs = homeStarterId
      ? Number(boxscore?.teams?.home?.players?.[`ID${homeStarterId}`]?.stats?.pitching?.strikeOuts ?? 0)
      : undefined;

    actual = {
      awayRuns,
      homeRuns,
      total,
      inningsCompleted,
      f5Runs,
      f5Complete,
      firstInningRuns,
      firstInningComplete,
      awayStarterKs,
      homeStarterKs,
    };
  }

  return {
    gamePk: game.gamePk,
    away: { id: away.id, name: away.name, abbr: feed.gameData?.teams?.away?.abbreviation },
    home: { id: home.id, name: home.name, abbr: feed.gameData?.teams?.home?.abbreviation },
    gameDate: game.gameDate,
    status,
    venueId,
    venueName: feed.gameData?.venue?.name ?? game.venue?.name,
    weather,
    prediction,
    awayStarter: game.teams.away.probablePitcher
      ? {
          id: game.teams.away.probablePitcher.id,
          name: game.teams.away.probablePitcher.fullName,
          k9: k9From(awayStarterStats),
        }
      : undefined,
    homeStarter: game.teams.home.probablePitcher
      ? {
          id: game.teams.home.probablePitcher.id,
          name: game.teams.home.probablePitcher.fullName,
          k9: k9From(homeStarterStats),
        }
      : undefined,
    awayTravelMiles,
    actual,
  };
}

function makeBase(g: GameInsight) {
  return {
    gamePk: g.gamePk,
    gameLabel: gameLabel(g),
    firstPitch: g.gameDate,
    confidenceScore: g.prediction.confidence.score,
    confidenceReasons: g.prediction.confidence.reasons,
    status: g.status,
  };
}

/**
 * Grade an opportunity given the game state. For preview games, returns
 * 'pending'. For live games, returns 'live' (final result not yet known).
 * For final games, returns 'hit' / 'miss' / 'push' based on category logic.
 *
 * Each category has its own implicit market:
 *   total-high / shootout / weather (positive) / park (high) → over the implied line
 *   total-low / weather (negative) / park (low) / k-matchup → under the implied line
 *   mismatch → side ML
 *   travel → side ML (away under-perform = home ML)
 */
function gradeOpportunity(
  category: Opportunity['category'],
  g: GameInsight,
  impliedSide?: 'home' | 'away'
): { result: OpportunityResult; actualText?: string } {
  if (g.status === 'preview' || !g.actual) return { result: 'pending' };

  const actual = g.actual.total;
  const projected = g.prediction.expectedTotal;
  const innings = g.actual.inningsCompleted;
  const remaining = Math.max(0, 9 - innings);
  const pace = innings > 0 ? (actual / innings) * 9 : projected;
  const homeWon = g.actual.homeRuns > g.actual.awayRuns;
  const isFinal = g.status === 'final';

  // Each category gets an actualText tailored to what the prediction is
  // actually about — total-high opps surface pace and runs needed, mismatch
  // opps surface the score + winner, travel opps surface the away/home line.
  switch (category) {
    case 'total-high':
    case 'shootout':
    case 'park':
    case 'weather': {
      // OVER bias: at least Math.floor(projected) − 0.5 is what we'd take
      const line = Math.max(7.5, Math.floor(projected) - 0.5);
      if (isFinal) {
        const hit = actual > line;
        return {
          result: hit ? 'hit' : 'miss',
          actualText: `Final ${actual} R · over ${line.toFixed(1)} ${hit ? '✓' : '✗'} · proj ${projected.toFixed(1)}`,
        };
      }
      // Live: track pace + how many runs needed
      const needed = Math.max(0, Math.ceil(line) + 1 - actual);
      return {
        result: 'live',
        actualText:
          needed === 0
            ? `Live: ${actual} R through ${innings} inn · over ${line.toFixed(1)} locked`
            : `Live: ${actual} R through ${innings} inn · pace ${pace.toFixed(1)} · need ${needed} more for over ${line.toFixed(1)}`,
      };
    }
    case 'total-low':
    case 'k-matchup': {
      // UNDER bias
      const line = Math.min(10.5, Math.ceil(projected) + 0.5);
      if (isFinal) {
        const hit = actual < line;
        return {
          result: hit ? 'hit' : 'miss',
          actualText: `Final ${actual} R · under ${line.toFixed(1)} ${hit ? '✓' : '✗'} · proj ${projected.toFixed(1)}`,
        };
      }
      const cushion = Math.max(0, line - actual);
      return {
        result: 'live',
        actualText:
          actual >= line
            ? `Live: ${actual} R through ${innings} inn · over ${line.toFixed(1)} (under busted)`
            : `Live: ${actual} R through ${innings} inn · ${cushion.toFixed(0)} R cushion · pace ${pace.toFixed(1)}`,
      };
    }
    case 'mismatch': {
      const diff = g.actual.homeRuns - g.actual.awayRuns;
      const lead =
        diff === 0 ? 'tied' :
        diff > 0 ? `home leads by ${diff}` : `away leads by ${-diff}`;
      if (isFinal) {
        if (impliedSide === 'home') {
          return { result: homeWon ? 'hit' : 'miss', actualText: `Final ${g.actual.awayRuns}–${g.actual.homeRuns} · home ${homeWon ? 'won ✓' : 'lost ✗'}` };
        } else if (impliedSide === 'away') {
          return { result: !homeWon ? 'hit' : 'miss', actualText: `Final ${g.actual.awayRuns}–${g.actual.homeRuns} · away ${!homeWon ? 'won ✓' : 'lost ✗'}` };
        }
        return { result: 'no-grade', actualText: `Final ${g.actual.awayRuns}–${g.actual.homeRuns}` };
      }
      // Live: who's leading + score + innings remaining
      return {
        result: 'live',
        actualText: `Live: ${g.actual.awayRuns}–${g.actual.homeRuns} · ${lead} · ${remaining} inn left`,
      };
    }
    case 'travel': {
      // Travel disadvantages the visitor → away club is the focus
      if (isFinal) {
        const awayUnderperformed = g.actual.awayRuns < g.actual.homeRuns;
        return {
          result: awayUnderperformed ? 'hit' : 'miss',
          actualText: `Final · away ${g.actual.awayRuns} R, home ${g.actual.homeRuns} R · away ${awayUnderperformed ? 'under-performed ✓' : 'over-performed ✗'}`,
        };
      }
      const awayPace = innings > 0 ? (g.actual.awayRuns / innings) * 9 : 4.5;
      return {
        result: 'live',
        actualText: `Live: away ${g.actual.awayRuns} R, home ${g.actual.homeRuns} R · away on pace for ${awayPace.toFixed(1)} R`,
      };
    }
  }
}

function generateOpportunities(insights: GameInsight[]): Opportunity[] {
  if (!insights.length) return [];
  const opps: Opportunity[] = [];

  const sortedByTotal = [...insights].sort((a, b) => b.prediction.expectedTotal - a.prediction.expectedTotal);
  const median = sortedByTotal[Math.floor(sortedByTotal.length / 2)]?.prediction.expectedTotal ?? 9;

  const pushOpp = (o: Omit<Opportunity, 'result' | 'actualText'>, impliedSide?: 'home' | 'away') => {
    const grade = gradeOpportunity(o.category, sortedByTotal.find((g) => g.gamePk === o.gamePk)!, impliedSide);
    opps.push({ ...o, result: grade.result, actualText: grade.actualText });
  };

  for (const g of sortedByTotal) {
    if (g.prediction.confidence.level === 'low') continue;
    const delta = g.prediction.expectedTotal - median;
    if (delta >= 1.5) {
      pushOpp({
        ...makeBase(g),
        category: 'total-high',
        headline: `${g.away.abbr ?? g.away.name} at ${g.home.abbr ?? g.home.name} projects high`,
        subline: `${g.venueName ?? ''} · 80% CI ${g.prediction.ci80.low.toFixed(1)}–${g.prediction.ci80.high.toFixed(1)} runs`,
        explanation:
          `The model expects ${g.prediction.expectedTotal.toFixed(1)} combined runs in this game — that's ${delta.toFixed(1)} more than the median game on today's slate (${median.toFixed(1)}). ` +
          `Both clubs' run rates, the starting pitcher quality, the ballpark, and current weather all point toward an above-average scoring environment.`,
        prediction: `Expected total runs: ${g.prediction.expectedTotal.toFixed(1)} (80% interval ${g.prediction.ci80.low.toFixed(1)}–${g.prediction.ci80.high.toFixed(1)})`,
        metric: `${g.prediction.expectedTotal.toFixed(1)} R`,
        importance: Math.min(100, 60 + delta * 8),
        confidence: g.prediction.confidence.level,
      });
    } else if (delta <= -1.5) {
      pushOpp({
        ...makeBase(g),
        category: 'total-low',
        headline: `${g.away.abbr ?? g.away.name} at ${g.home.abbr ?? g.home.name} projects low`,
        subline: `Pitchers' duel watch · ${g.venueName ?? ''}`,
        explanation:
          `The model expects only ${g.prediction.expectedTotal.toFixed(1)} combined runs — ${Math.abs(delta).toFixed(1)} below today's slate median (${median.toFixed(1)}). ` +
          `Some combination of strong starting pitching, a pitcher-friendly venue, suppressive weather, or anemic offenses is dragging the projection down.`,
        prediction: `Expected total runs: ${g.prediction.expectedTotal.toFixed(1)} (80% interval ${g.prediction.ci80.low.toFixed(1)}–${g.prediction.ci80.high.toFixed(1)})`,
        metric: `${g.prediction.expectedTotal.toFixed(1)} R`,
        importance: Math.min(100, 60 + Math.abs(delta) * 8),
        confidence: g.prediction.confidence.level,
      });
    }
  }

  for (const g of insights) {
    const wx = g.prediction.modifiers.find((m) => m.name === 'Weather');
    if (!wx) continue;
    const pct = (wx.multiplier - 1) * 100;
    if (Math.abs(pct) < 5) continue;
    const direction = pct > 0 ? 'lifting' : 'suppressing';
    pushOpp({
      ...makeBase(g),
      category: 'weather',
      headline: `Weather is ${direction} offense at ${g.venueName ?? g.home.abbr ?? g.home.name}`,
      subline: wx.note,
      explanation:
        `Current conditions move the run-total projection by ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%. ` +
        `Components: ${wx.note}. Wind direction (especially out vs. in to center field) and air temperature have the largest single-pitch effect on ball flight, so this is a meaningful tailwind${pct < 0 ? '/headwind' : ''} for the offense in this game.`,
      prediction: `Weather modifier: ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% on expected runs`,
      metric: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
      importance: Math.min(100, 50 + Math.abs(pct) * 4),
      confidence: g.prediction.confidence.level,
    });
  }

  for (const g of insights) {
    const aceK9 = Math.max(g.awayStarter?.k9 ?? 0, g.homeStarter?.k9 ?? 0);
    if (aceK9 < 11) continue;
    const ace = (g.awayStarter?.k9 ?? 0) > (g.homeStarter?.k9 ?? 0) ? g.awayStarter! : g.homeStarter!;
    pushOpp({
      ...makeBase(g),
      category: 'k-matchup',
      headline: `${ace.name} on the bump — elite strikeout rate`,
      subline: `${g.away.abbr ?? g.away.name} at ${g.home.abbr ?? g.home.name} · ${g.venueName ?? ''}`,
      explanation:
        `${ace.name} is averaging ${ace.k9!.toFixed(1)} strikeouts per 9 innings this season — well above the league average of about 8.5. ` +
        `Combined with this venue's strikeout factor, the per-pitcher K projection is elevated. Useful for over/under K props on the starter.`,
      prediction: `${ace.name}: ${ace.k9!.toFixed(1)} K/9 season rate`,
      metric: `${ace.k9!.toFixed(1)} K/9`,
      importance: Math.min(100, 50 + (aceK9 - 10) * 6),
      confidence: g.prediction.confidence.level,
    });
  }

  for (const g of insights) {
    const park = getPark(g.venueId);
    if (park.runs >= 110) {
      pushOpp({
        ...makeBase(g),
        category: 'park',
        headline: `${park.name} is among the league's best hitter parks`,
        subline: `${g.away.abbr ?? g.away.name} at ${g.home.abbr ?? g.home.name}`,
        explanation:
          `${park.name} carries a runs factor of ${park.runs} (100 = league average), a 3-year average. ` +
          `Expect inflated scoring and a bump on home-run probability for batters in this game versus a neutral venue.`,
        prediction: `Park factor: ${park.runs} (runs); HR factor: ${park.hr}`,
        metric: `Park ${park.runs}`,
        importance: 60 + (park.runs - 110) * 2,
        confidence: 'high',
      });
    } else if (park.runs <= 92) {
      pushOpp({
        ...makeBase(g),
        category: 'park',
        headline: `${park.name} is among the league's most pitcher-friendly venues`,
        subline: `${g.away.abbr ?? g.away.name} at ${g.home.abbr ?? g.home.name}`,
        explanation:
          `${park.name} carries a runs factor of ${park.runs} — well below the league-average 100. ` +
          `Expect suppressed scoring; HR projections should be discounted versus a neutral park.`,
        prediction: `Park factor: ${park.runs} (runs); HR factor: ${park.hr}`,
        metric: `Park ${park.runs}`,
        importance: 55 + (92 - park.runs) * 2,
        confidence: 'high',
      });
    }
  }

  for (const g of insights) {
    if (g.prediction.confidence.level === 'low') continue;
    const pHome = g.prediction.pHomeWin;
    if (pHome > 0.70) {
      pushOpp({
        ...makeBase(g),
        category: 'mismatch',
        headline: `${g.home.abbr ?? g.home.name} a heavy favorite at home`,
        subline: `vs ${g.away.abbr ?? g.away.name}`,
        explanation:
          `The model gives the home club a ${(pHome * 100).toFixed(0)}% chance to win — well outside the typical 50/50 range. ` +
          `That's driven by a meaningful gap in season run rates and the starters' projected effectiveness, plus the standard 54% home-field bump.`,
        prediction: `Home win probability: ${(pHome * 100).toFixed(1)}%`,
        metric: `${(pHome * 100).toFixed(0)}% home`,
        importance: Math.round(50 + (pHome - 0.5) * 100),
        confidence: g.prediction.confidence.level,
        probability: pHome,
      }, 'home');
    } else if (pHome < 0.30) {
      pushOpp({
        ...makeBase(g),
        category: 'mismatch',
        headline: `${g.away.abbr ?? g.away.name} a heavy road favorite`,
        subline: `at ${g.home.abbr ?? g.home.name}`,
        explanation:
          `The model gives the visiting club a ${((1 - pHome) * 100).toFixed(0)}% chance to win — overcoming the standard home-field disadvantage and then some. ` +
          `Strong road favorites are uncommon and usually point to a notable talent or starting-pitching gap.`,
        prediction: `Away win probability: ${((1 - pHome) * 100).toFixed(1)}%`,
        metric: `${((1 - pHome) * 100).toFixed(0)}% road`,
        importance: Math.round(50 + (0.5 - pHome) * 100),
        confidence: g.prediction.confidence.level,
        probability: 1 - pHome,
      }, 'away');
    }
  }

  insights
    .filter((g) => g.awayTravelMiles >= 2000)
    .sort((a, b) => b.awayTravelMiles - a.awayTravelMiles)
    .forEach((g) => {
      pushOpp({
        ...makeBase(g),
        category: 'travel',
        headline: `${g.away.abbr ?? g.away.name} on a long road trip`,
        subline: `Visiting ${g.home.abbr ?? g.home.name}`,
        explanation:
          `The visiting club traveled approximately ${Math.round(g.awayTravelMiles)} miles since their last game. ` +
          `Long cross-country travel and short rest tend to shave a small amount off offensive production — directionally suggestive but not large in magnitude.`,
        prediction: `Visitor travel: ~${Math.round(g.awayTravelMiles)} miles`,
        metric: `${Math.round(g.awayTravelMiles)} mi`,
        importance: Math.round(45 + (g.awayTravelMiles - 2000) / 50),
        confidence: 'medium',
      });
    });

  for (const g of insights) {
    const park = getPark(g.venueId);
    const wx = g.prediction.modifiers.find((m) => m.name === 'Weather')?.multiplier ?? 1;
    const stack = (park.runs / 100) * wx;
    if (stack >= 1.12) {
      pushOpp({
        ...makeBase(g),
        category: 'shootout',
        headline: `Shootout setup at ${park.name}`,
        subline: `${g.away.abbr ?? g.away.name} at ${g.home.abbr ?? g.home.name}`,
        explanation:
          `Park factor and weather are stacking the deck for offense by about +${((stack - 1) * 100).toFixed(0)}% combined. ` +
          `${park.name} is naturally hitter-friendly, and current conditions are working in the same direction. When both lift simultaneously the run environment can spike well above the model's mean projection.`,
        prediction: `Park × weather stacking: +${((stack - 1) * 100).toFixed(0)}%`,
        metric: `+${((stack - 1) * 100).toFixed(0)}%`,
        importance: Math.round(70 + (stack - 1) * 150),
        confidence: g.prediction.confidence.level,
      });
    }
  }

  // Sort: live first, then pending, then graded (hits before misses for receipts)
  const statusRank = (o: Opportunity) =>
    o.status === 'live' ? 0 : o.status === 'preview' ? 1 : 2;
  const resultRank = (o: Opportunity) =>
    o.result === 'live' ? 0 : o.result === 'pending' ? 1 : o.result === 'hit' ? 2 : o.result === 'miss' ? 3 : 4;

  return opps
    .filter((o) => o.confidence !== 'low')
    .sort((a, b) => {
      const sr = statusRank(a) - statusRank(b);
      if (sr !== 0) return sr;
      const rr = resultRank(a) - resultRank(b);
      if (rr !== 0) return rr;
      return b.importance - a.importance;
    })
    .slice(0, 32); // Allow more entries since finals are now included as receipts
}

function gameLabel(g: GameInsight): string {
  return `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}`;
}
