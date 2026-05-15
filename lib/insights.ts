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
  gamePk: number;
  gameLabel: string;
  importance: number; // 0-100, used for sort + visual weighting
  confidence: 'low' | 'medium' | 'high';
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

function generateOpportunities(insights: GameInsight[]): Opportunity[] {
  if (!insights.length) return [];
  const opps: Opportunity[] = [];

  // ── Standout-only thresholds ──
  // Total: only flag if 1.5+ runs above/below the slate median (real edge)
  const sortedByTotal = [...insights].sort((a, b) => b.prediction.expectedTotal - a.prediction.expectedTotal);
  const median = sortedByTotal[Math.floor(sortedByTotal.length / 2)]?.prediction.expectedTotal ?? 9;

  for (const g of sortedByTotal) {
    if (g.prediction.confidence.level === 'low') continue;
    const delta = g.prediction.expectedTotal - median;
    if (delta >= 1.5) {
      opps.push({
        category: 'total-high',
        headline: `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}: ${g.prediction.expectedTotal.toFixed(1)} runs (slate +${delta.toFixed(1)})`,
        subline: `${g.venueName ?? ''} · 80% CI ${g.prediction.ci80.low.toFixed(1)}–${g.prediction.ci80.high.toFixed(1)}`,
        metric: `xR ${g.prediction.expectedTotal.toFixed(1)}`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: Math.min(100, 60 + delta * 8),
        confidence: g.prediction.confidence.level,
      });
    } else if (delta <= -1.5) {
      opps.push({
        category: 'total-low',
        headline: `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}: ${g.prediction.expectedTotal.toFixed(1)} runs (slate ${delta.toFixed(1)})`,
        subline: `Pitchers' duel watch · ${g.venueName ?? ''}`,
        metric: `xR ${g.prediction.expectedTotal.toFixed(1)}`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: Math.min(100, 60 + Math.abs(delta) * 8),
        confidence: g.prediction.confidence.level,
      });
    }
  }

  // Weather: ≥5% impact
  for (const g of insights) {
    const wx = g.prediction.modifiers.find((m) => m.name === 'Weather');
    if (!wx) continue;
    const pct = (wx.multiplier - 1) * 100;
    if (Math.abs(pct) < 5) continue;
    opps.push({
      category: 'weather',
      headline: `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}: weather ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
      subline: wx.note,
      metric: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
      gamePk: g.gamePk,
      gameLabel: gameLabel(g),
      importance: Math.min(100, 50 + Math.abs(pct) * 4),
      confidence: g.prediction.confidence.level,
    });
  }

  // K matchup: only K/9 ≥ 11
  for (const g of insights) {
    const aceK9 = Math.max(g.awayStarter?.k9 ?? 0, g.homeStarter?.k9 ?? 0);
    if (aceK9 < 11) continue;
    const ace = (g.awayStarter?.k9 ?? 0) > (g.homeStarter?.k9 ?? 0) ? g.awayStarter! : g.homeStarter!;
    opps.push({
      category: 'k-matchup',
      headline: `${ace.name}: ${ace.k9!.toFixed(1)} K/9 — elite K projection`,
      subline: `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name} · ${g.venueName ?? ''}`,
      metric: `${ace.k9!.toFixed(1)} K/9`,
      gamePk: g.gamePk,
      gameLabel: gameLabel(g),
      importance: Math.min(100, 50 + (aceK9 - 10) * 6),
      confidence: g.prediction.confidence.level,
    });
  }

  // Park amplifications: only extreme (>= 110 or <= 92)
  for (const g of insights) {
    const park = getPark(g.venueId);
    if (park.runs >= 110) {
      opps.push({
        category: 'park',
        headline: `${park.name} (factor ${park.runs}) lifts run scoring`,
        subline: `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}`,
        metric: `Park ${park.runs}`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: 60 + (park.runs - 110) * 2,
        confidence: 'high',
      });
    } else if (park.runs <= 92) {
      opps.push({
        category: 'park',
        headline: `${park.name} (factor ${park.runs}) suppresses run scoring`,
        subline: `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}`,
        metric: `Park ${park.runs}`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: 55 + (92 - park.runs) * 2,
        confidence: 'high',
      });
    }
  }

  // Talent mismatch: pHomeWin > 70% or < 30% AND prediction confidence not low
  for (const g of insights) {
    if (g.prediction.confidence.level === 'low') continue;
    const pHome = g.prediction.pHomeWin;
    if (pHome > 0.70) {
      opps.push({
        category: 'mismatch',
        headline: `${g.home.abbr ?? g.home.name} a ${(pHome * 100).toFixed(0)}% favorite at home`,
        subline: `vs ${g.away.abbr ?? g.away.name} · model sees a sizable gap`,
        metric: `${(pHome * 100).toFixed(0)}%`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: Math.round(50 + (pHome - 0.5) * 100),
        confidence: g.prediction.confidence.level,
        probability: pHome,
      });
    } else if (pHome < 0.30) {
      opps.push({
        category: 'mismatch',
        headline: `${g.away.abbr ?? g.away.name} a ${((1 - pHome) * 100).toFixed(0)}% road favorite`,
        subline: `at ${g.home.abbr ?? g.home.name} · sizable talent gap`,
        metric: `${((1 - pHome) * 100).toFixed(0)}%`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: Math.round(50 + (0.5 - pHome) * 100),
        confidence: g.prediction.confidence.level,
        probability: 1 - pHome,
      });
    }
  }

  // Travel: ≥ 2000 miles only (cross-country)
  insights
    .filter((g) => g.awayTravelMiles >= 2000)
    .sort((a, b) => b.awayTravelMiles - a.awayTravelMiles)
    .forEach((g) => {
      opps.push({
        category: 'travel',
        headline: `${g.away.abbr ?? g.away.name} on a ${Math.round(g.awayTravelMiles)} mi road trip`,
        subline: `Visiting ${g.home.abbr ?? g.home.name} after a long haul`,
        metric: `${Math.round(g.awayTravelMiles)} mi`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: Math.round(45 + (g.awayTravelMiles - 2000) / 50),
        confidence: 'medium',
      });
    });

  // Shootout: park × weather stacking ≥ +12%
  for (const g of insights) {
    const park = getPark(g.venueId);
    const wx = g.prediction.modifiers.find((m) => m.name === 'Weather')?.multiplier ?? 1;
    const stack = (park.runs / 100) * wx;
    if (stack >= 1.12) {
      opps.push({
        category: 'shootout',
        headline: `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}: park × weather +${((stack - 1) * 100).toFixed(0)}%`,
        subline: `${park.name} · ${g.weather?.tempF ? `${g.weather.tempF}°F` : ''} ${g.weather?.windDir ?? ''}`,
        metric: `+${((stack - 1) * 100).toFixed(0)}%`,
        gamePk: g.gamePk,
        gameLabel: gameLabel(g),
        importance: Math.round(70 + (stack - 1) * 150),
        confidence: g.prediction.confidence.level,
      });
    }
  }

  // Filter to medium+ confidence only and sort
  return opps
    .filter((o) => o.confidence !== 'low')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 24);
}

function gameLabel(g: GameInsight): string {
  return `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}`;
}
