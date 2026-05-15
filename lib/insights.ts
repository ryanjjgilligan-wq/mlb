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
  type ScheduleGame,
} from './mlb';
import { getPark, haversineMiles } from './parks';
import { fip, parseInnings } from './saber';
import {
  predictRunTotal,
  type RunTotalInput,
  type RunTotalOutput,
  type WeatherInput,
} from './predict';
import { ymd } from './time';

export type GameInsight = {
  gamePk: number;
  away: { id: number; name: string; abbr?: string };
  home: { id: number; name: string; abbr?: string };
  gameDate: string;
  venueId?: number;
  venueName?: string;
  weather?: WeatherInput;
  prediction: RunTotalOutput;
  awayStarter?: { id: number; name: string; k9?: number };
  homeStarter?: { id: number; name: string; k9?: number };
  awayTravelMiles: number;
};

export type Opportunity = {
  category: 'total-high' | 'total-low' | 'weather' | 'k-matchup' | 'mismatch' | 'park' | 'travel' | 'shootout';
  headline: string;
  subline: string;
  metric: string;
  /** Plain-English explanation of WHY this is notable and what the user should take away. */
  explanation: string;
  /** What the model is actually predicting in concrete terms (e.g. "expected total runs: 12.4"). */
  prediction: string;
  /** First-pitch ISO so the UI can render countdown + local time. */
  firstPitch: string;
  gamePk: number;
  gameLabel: string;
  importance: number; // 0-100, used for sort + visual weighting
  confidence: 'low' | 'medium' | 'high';
  confidenceScore: number; // 0-100 numeric
  confidenceReasons: string[];
  probability?: number; // 0-1 if applicable, used for display + threshold
};

export async function buildSlateInsights(date?: string): Promise<{
  date: string;
  games: GameInsight[];
  opportunities: Opportunity[];
}> {
  const d = date ?? ymd();
  const schedule = await getSchedule(d).catch(() => []);
  const games = (schedule[0]?.games ?? []).filter((g) => g.status.abstractGameState === 'Preview');
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

  const [feed, awayLast, awayStarterStats, homeStarterStats] = await Promise.all([
    getGameLive(game.gamePk).catch(() => null),
    getLastGameForTeam(away.id, date).catch(() => null),
    game.teams.away.probablePitcher?.id
      ? getPlayerSeasonStats(game.teams.away.probablePitcher.id, 'pitching').catch(() => null)
      : Promise.resolve(null),
    game.teams.home.probablePitcher?.id
      ? getPlayerSeasonStats(game.teams.home.probablePitcher.id, 'pitching').catch(() => null)
      : Promise.resolve(null),
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

  const starterInput = (sp: any) => {
    if (!sp?.stat) return undefined;
    const computedFip = fip(sp.stat);
    const ip = parseInnings(sp.stat.inningsPitched);
    const gs = Number(sp.stat.gamesStarted) || Number(sp.stat.gamesPlayed) || 1;
    return {
      fip: Number.isFinite(computedFip) && computedFip > 0 ? computedFip : undefined,
      ipPerStart: gs > 0 ? Math.min(7, Math.max(3, ip / gs)) : 5.5,
    };
  };

  const input: RunTotalInput = {
    home: { teamId: home.id, runsScoredPerGame: teamRate(homeRec, 'runsScored'), runsAllowedPerGame: teamRate(homeRec, 'runsAllowed') },
    away: { teamId: away.id, runsScoredPerGame: teamRate(awayRec, 'runsScored'), runsAllowedPerGame: teamRate(awayRec, 'runsAllowed') },
    homeStarter: starterInput(homeStarterStats),
    awayStarter: starterInput(awayStarterStats),
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

  return {
    gamePk: game.gamePk,
    away: { id: away.id, name: away.name, abbr: feed.gameData?.teams?.away?.abbreviation },
    home: { id: home.id, name: home.name, abbr: feed.gameData?.teams?.home?.abbreviation },
    gameDate: game.gameDate,
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
  };
}

function makeBase(g: GameInsight) {
  return {
    gamePk: g.gamePk,
    gameLabel: gameLabel(g),
    firstPitch: g.gameDate,
    confidenceScore: g.prediction.confidence.score,
    confidenceReasons: g.prediction.confidence.reasons,
  };
}

function generateOpportunities(insights: GameInsight[]): Opportunity[] {
  if (!insights.length) return [];
  const opps: Opportunity[] = [];

  const sortedByTotal = [...insights].sort((a, b) => b.prediction.expectedTotal - a.prediction.expectedTotal);
  const median = sortedByTotal[Math.floor(sortedByTotal.length / 2)]?.prediction.expectedTotal ?? 9;

  for (const g of sortedByTotal) {
    if (g.prediction.confidence.level === 'low') continue;
    const delta = g.prediction.expectedTotal - median;
    if (delta >= 1.5) {
      opps.push({
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
      opps.push({
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
    opps.push({
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
    opps.push({
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
      opps.push({
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
      opps.push({
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
      opps.push({
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
      });
    } else if (pHome < 0.30) {
      opps.push({
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
      });
    }
  }

  insights
    .filter((g) => g.awayTravelMiles >= 2000)
    .sort((a, b) => b.awayTravelMiles - a.awayTravelMiles)
    .forEach((g) => {
      opps.push({
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
      opps.push({
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

  return opps
    .filter((o) => o.confidence !== 'low')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 24);
}

function gameLabel(g: GameInsight): string {
  return `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}`;
}
