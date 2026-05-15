/**
 * MLB Stats API client.
 *
 * Base: https://statsapi.mlb.com/api/v1
 * Docs: https://github.com/toddrob99/MLB-StatsAPI/wiki and unofficial reference at
 *       https://github.com/brunoarueira/node-mlb-data-api
 *
 * This API is public, no key, but rate limits are not published — we cache aggressively.
 * All revalidation intervals are tuned by data volatility:
 *   - schedules / scoreboard: 30s during live windows, 5m otherwise
 *   - standings: 5m
 *   - rosters / player bios: 1h
 *   - season-aggregate stats: 5m
 *   - live boxscore / linescore: 15s
 */

const BASE = 'https://statsapi.mlb.com/api/v1';
const BASE_V11 = 'https://statsapi.mlb.com/api/v1.1';

type FetchOpts = { revalidate?: number; tags?: string[] };

async function get<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    next: { revalidate: opts.revalidate ?? 60, tags: opts.tags },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`MLB API ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json() as Promise<T>;
}

// ── Types (only the fields we actually consume) ─────────────────────────────

export type ScheduleGame = {
  gamePk: number;
  gameDate: string;
  status: { abstractGameState: string; detailedState: string; statusCode: string };
  teams: {
    away: { score?: number; team: { id: number; name: string }; leagueRecord?: { wins: number; losses: number }; probablePitcher?: { id: number; fullName: string } };
    home: { score?: number; team: { id: number; name: string }; leagueRecord?: { wins: number; losses: number }; probablePitcher?: { id: number; fullName: string } };
  };
  linescore?: {
    currentInning?: number;
    inningState?: string;
    isTopInning?: boolean;
    balls?: number;
    strikes?: number;
    outs?: number;
  };
  venue?: { id: number; name: string };
};

export type ScheduleDate = {
  date: string;
  games: ScheduleGame[];
};

// ── Schedule / Scoreboard ───────────────────────────────────────────────────

export async function getSchedule(date?: string): Promise<ScheduleDate[]> {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const data = await get<{ dates: ScheduleDate[] }>(
    `/schedule?sportId=1&date=${d}&hydrate=linescore,probablePitcher,team,venue`,
    { revalidate: 5, tags: ['schedule'] }
  );
  return data.dates ?? [];
}

export async function getScheduleRange(start: string, end: string): Promise<ScheduleDate[]> {
  const data = await get<{ dates: ScheduleDate[] }>(
    `/schedule?sportId=1&startDate=${start}&endDate=${end}&hydrate=linescore,probablePitcher,team`,
    { revalidate: 300 }
  );
  return data.dates ?? [];
}

// ── Standings ───────────────────────────────────────────────────────────────

export type StandingsRecord = {
  team: { id: number; name: string };
  wins: number;
  losses: number;
  winningPercentage: string;
  gamesBack: string;
  wildCardGamesBack: string;
  streak?: { streakCode: string };
  runDifferential?: number;
  runsScored?: number;
  runsAllowed?: number;
  divisionRank: string;
  leagueRank: string;
  records?: {
    splitRecords?: Array<{ type: string; wins: number; losses: number }>;
    expectedRecords?: Array<{ type: string; wins: number; losses: number; pct: string }>;
  };
};

export type StandingsDivision = {
  division: { id: number; name: string };
  league: { id: number; name: string };
  teamRecords: StandingsRecord[];
};

export async function getStandings(season?: number): Promise<StandingsDivision[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ records: StandingsDivision[] }>(
    `/standings?leagueId=103,104&season=${s}&standingsTypes=regularSeason&hydrate=division,league,team,record(expectedRecords)`,
    { revalidate: 300, tags: ['standings'] }
  );
  return data.records ?? [];
}

// ── Teams ───────────────────────────────────────────────────────────────────

export type Team = {
  id: number;
  name: string;
  teamName: string;
  locationName: string;
  abbreviation: string;
  league?: { id: number; name: string };
  division?: { id: number; name: string };
  venue?: { id: number; name: string };
  firstYearOfPlay?: string;
  active?: boolean;
};

export async function getTeams(season?: number): Promise<Team[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ teams: Team[] }>(
    `/teams?sportId=1&season=${s}&activeStatus=Y`,
    { revalidate: 3600 }
  );
  return (data.teams ?? []).filter((t) => t.active !== false);
}

export async function getTeam(id: number, season?: number): Promise<Team | null> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ teams: Team[] }>(
    `/teams/${id}?sportId=1&season=${s}&hydrate=league,division,venue`,
    { revalidate: 3600 }
  );
  return data.teams?.[0] ?? null;
}

export type RosterEntry = {
  person: { id: number; fullName: string };
  jerseyNumber?: string;
  position: { code: string; name: string; abbreviation: string };
  status: { code: string; description: string };
};

export async function getRoster(teamId: number, season?: number): Promise<RosterEntry[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ roster: RosterEntry[] }>(
    `/teams/${teamId}/roster?rosterType=active&season=${s}`,
    { revalidate: 1800 }
  );
  return data.roster ?? [];
}

/** Players currently on any flavor of injured list for a team. */
export async function getInjuryList(teamId: number, season?: number): Promise<RosterEntry[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ roster: RosterEntry[] }>(
    `/teams/${teamId}/roster?rosterType=fullRoster&season=${s}`,
    { revalidate: 1800 }
  ).catch(() => ({ roster: [] as RosterEntry[] }));
  return (data.roster ?? []).filter(
    (r) =>
      /injured|disabled/i.test(r.status.description) ||
      /^IL|^D\d|^DTD$/.test(r.status.code)
  );
}

// ── Team stats ──────────────────────────────────────────────────────────────

export async function getTeamStats(teamId: number, season?: number) {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/teams/${teamId}/stats?stats=season&group=hitting,pitching,fielding&season=${s}`,
    { revalidate: 600 }
  );
  return data?.stats ?? [];
}

// ── Players ─────────────────────────────────────────────────────────────────

export type Player = {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  primaryNumber?: string;
  birthDate?: string;
  currentAge?: number;
  birthCity?: string;
  birthStateProvince?: string;
  birthCountry?: string;
  height?: string;
  weight?: number;
  primaryPosition: { code: string; name: string; abbreviation: string };
  batSide: { code: string; description: string };
  pitchHand: { code: string; description: string };
  mlbDebutDate?: string;
  currentTeam?: { id: number; name: string };
  active?: boolean;
  draftYear?: number;
};

export async function getPlayer(id: number): Promise<Player | null> {
  const data = await get<{ people: Player[] }>(
    `/people/${id}?hydrate=currentTeam,stats(group=[hitting,pitching,fielding],type=[season])`,
    { revalidate: 1800 }
  );
  return data.people?.[0] ?? null;
}

export type PlayerStatSplit = {
  season: string;
  stat: Record<string, string | number>;
  team?: { id: number; name: string };
  league?: { id: number; name: string };
};

export async function getPlayerSeasonStats(
  id: number,
  group: 'hitting' | 'pitching' | 'fielding' = 'hitting',
  season?: number
): Promise<PlayerStatSplit | null> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/people/${id}/stats?stats=season&group=${group}&season=${s}`,
    { revalidate: 600 }
  );
  const splits = data?.stats?.[0]?.splits ?? [];
  return splits[0] ?? null;
}

export async function getPlayerCareerStats(
  id: number,
  group: 'hitting' | 'pitching' = 'hitting'
): Promise<PlayerStatSplit[]> {
  const data = await get<any>(
    `/people/${id}/stats?stats=yearByYear&group=${group}`,
    { revalidate: 86400 }
  );
  return data?.stats?.[0]?.splits ?? [];
}

/** Game log — every game played this season with per-game counting stats. */
export async function getPlayerGameLog(
  id: number,
  group: 'hitting' | 'pitching' = 'hitting',
  season?: number
): Promise<any[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/people/${id}/stats?stats=gameLog&group=${group}&season=${s}`,
    { revalidate: 600 }
  );
  return data?.stats?.[0]?.splits ?? [];
}

/** Splits — vs LHP / vs RHP, home/away, day/night, etc. */
export async function getPlayerSplits(
  id: number,
  group: 'hitting' | 'pitching' = 'hitting',
  season?: number
): Promise<any[]> {
  const s = season ?? new Date().getFullYear();
  const sitCodes = group === 'hitting'
    ? 'vl,vr,h,a,d,n' // vs LHP, vs RHP, home, away, day, night
    : 'vl,vr,h,a,d,n';
  const data = await get<any>(
    `/people/${id}/stats?stats=statSplits&sitCodes=${sitCodes}&group=${group}&season=${s}`,
    { revalidate: 600 }
  );
  return data?.stats?.[0]?.splits ?? [];
}

/** League-wide hitting leaders — used as the comparables corpus. */
export async function getHittingLeaders(season?: number, limit = 200): Promise<any[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/stats?stats=season&group=hitting&season=${s}&playerPool=Qualified&limit=${limit}`,
    { revalidate: 3600 }
  );
  return data?.stats?.[0]?.splits ?? [];
}

export async function getPitchingLeaders(season?: number, limit = 200): Promise<any[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/stats?stats=season&group=pitching&season=${s}&playerPool=Qualified&limit=${limit}`,
    { revalidate: 3600 }
  );
  return data?.stats?.[0]?.splits ?? [];
}

/**
 * Most recent prior game for a team. Used to compute travel distance and
 * days of rest going into the next matchup.
 */
export async function getLastGameForTeam(teamId: number, beforeDate: string, season?: number): Promise<ScheduleGame | null> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ dates: ScheduleDate[] }>(
    `/schedule?sportId=1&teamId=${teamId}&season=${s}&hydrate=team,venue`,
    { revalidate: 3600 }
  );
  const games = (data.dates ?? [])
    .filter((d) => d.date < beforeDate)
    .flatMap((d) => d.games)
    .filter((g) => g.status.abstractGameState === 'Final')
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  return games[0] ?? null;
}

/**
 * Head-to-head schedule between two teams in a given season.
 * Returns games sorted reverse-chronologically (most recent first).
 */
export async function getHeadToHeadSchedule(
  teamA: number,
  teamB: number,
  season?: number
): Promise<ScheduleGame[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ dates: ScheduleDate[] }>(
    `/schedule?sportId=1&teamId=${teamA}&opponentId=${teamB}&season=${s}&hydrate=team,linescore,venue`,
    { revalidate: 3600 }
  );
  return (data.dates ?? [])
    .flatMap((d) => d.games)
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate));
}

/**
 * Career batter-vs-pitcher line via the vsPlayer split.
 * Returns the single combined-career split for the matchup, or null.
 */
export async function getBatterVsPitcher(batterId: number, pitcherId: number): Promise<any | null> {
  const data = await get<any>(
    `/people/${batterId}/stats?stats=vsPlayer&opposingPlayerId=${pitcherId}&group=hitting`,
    { revalidate: 3600 }
  ).catch(() => null);
  // Combined-career split is type "vsPlayerTotal" / period "career" with sportId=1
  const groups = data?.stats ?? [];
  for (const g of groups) {
    const split = (g.splits ?? []).find((sp: any) =>
      sp?.season === undefined || sp?.season === ''
    ) ?? g.splits?.[0];
    if (split) return split;
  }
  return null;
}

/** Monthly splits — `byMonth` returns one row per calendar month played. */
/**
 * Last-N-games aggregated team stats. Returns a single split with the team's
 * combined hitting or pitching line over the last N games. Uses the
 * `lastXGames` stats type which is the API's native rolling-window endpoint.
 */
export async function getTeamLastXGamesHitting(teamId: number, n: number, season?: number): Promise<Record<string, any> | null> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/teams/${teamId}/stats?stats=lastXGames&group=hitting&season=${s}&numberOfGames=${n}`,
    { revalidate: 1800 }
  ).catch(() => null);
  return data?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

export async function getTeamLastXGamesPitching(teamId: number, n: number, season?: number): Promise<Record<string, any> | null> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/teams/${teamId}/stats?stats=lastXGames&group=pitching&season=${s}&numberOfGames=${n}`,
    { revalidate: 1800 }
  ).catch(() => null);
  return data?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

/**
 * Last-N-games aggregated stats for a single player.
 * For pitchers, "games" = appearances (or starts if you filter upstream).
 */
export async function getPlayerLastXGames(
  id: number,
  group: 'hitting' | 'pitching',
  n: number,
  season?: number
): Promise<Record<string, any> | null> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/people/${id}/stats?stats=lastXGames&group=${group}&season=${s}&numberOfGames=${n}`,
    { revalidate: 1800 }
  ).catch(() => null);
  return data?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

export async function getTeamMonthlyHitting(teamId: number, season?: number): Promise<any[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/teams/${teamId}/stats?stats=byMonth&group=hitting&season=${s}`,
    { revalidate: 1800 }
  );
  return data?.stats?.[0]?.splits ?? [];
}

export async function getTeamMonthlyPitching(teamId: number, season?: number): Promise<any[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/teams/${teamId}/stats?stats=byMonth&group=pitching&season=${s}`,
    { revalidate: 1800 }
  );
  return data?.stats?.[0]?.splits ?? [];
}

/**
 * League-wide aggregate hitting and pitching for a season — the context
 * needed to compute wRC+, OPS+, ERA−.
 *
 * Returns simple aggregate rate + a derived runs-per-PA constant suitable
 * for league-context normalization.
 */
export async function getLeagueContext(season?: number) {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/teams/stats?sportId=1&season=${s}&group=hitting,pitching&stats=season`,
    { revalidate: 3600 }
  ).catch(() => null);
  const hittingSplits = data?.stats?.find((g: any) => g.group?.displayName === 'hitting')?.splits ?? [];
  const pitchingSplits = data?.stats?.find((g: any) => g.group?.displayName === 'pitching')?.splits ?? [];

  const sumHit = (k: string) => hittingSplits.reduce((s: number, sp: any) => s + (Number(sp.stat?.[k]) || 0), 0);
  const sumPit = (k: string) => pitchingSplits.reduce((s: number, sp: any) => s + (Number(sp.stat?.[k]) || 0), 0);

  const lgPA = sumHit('plateAppearances');
  const lgAB = sumHit('atBats');
  const lgR = sumHit('runs');
  const lgH = sumHit('hits');
  const lgBB = sumHit('baseOnBalls');
  const lgHBP = sumHit('hitByPitch');
  const lgSF = sumHit('sacFlies');
  const lgHR = sumHit('homeRuns');
  const lgIP_decimal = pitchingSplits.reduce((acc: number, sp: any) => {
    const ip = String(sp.stat?.inningsPitched ?? '0');
    const dot = ip.indexOf('.');
    if (dot < 0) return acc + (parseFloat(ip) || 0);
    return acc + (parseInt(ip.slice(0, dot), 10) || 0) + (parseInt(ip.slice(dot + 1), 10) || 0) / 3;
  }, 0);
  const lgER = sumPit('earnedRuns');
  const lgERA = lgIP_decimal > 0 ? (lgER * 9) / lgIP_decimal : 4.5;

  // League OBP and SLG
  const lgOBP = (lgH + lgBB + lgHBP) / Math.max(1, lgAB + lgBB + lgHBP + lgSF);
  const singles = lgH - sumHit('doubles') - sumHit('triples') - lgHR;
  const lgTB = singles + 2 * sumHit('doubles') + 3 * sumHit('triples') + 4 * lgHR;
  const lgSLG = lgAB > 0 ? lgTB / lgAB : 0.4;
  const lgOPS = lgOBP + lgSLG;

  // League wOBA using the same static linear weights as elsewhere
  const wOBA_NUM =
    0.696 * (lgBB - sumHit('intentionalWalks')) +
    0.728 * lgHBP +
    0.883 * singles +
    1.244 * sumHit('doubles') +
    1.569 * sumHit('triples') +
    2.004 * lgHR;
  const wOBA_DEN = lgAB + lgBB - sumHit('intentionalWalks') + lgSF + lgHBP;
  const lgWOBA = wOBA_DEN > 0 ? wOBA_NUM / wOBA_DEN : 0.310;

  return {
    season: s,
    lgPA, lgAB, lgR, lgH, lgBB, lgHBP, lgSF, lgHR,
    lgOBP, lgSLG, lgOPS, lgWOBA, lgIP: lgIP_decimal, lgER, lgERA,
    runsPerPA: lgPA > 0 ? lgR / lgPA : 0.117,
    // Standard wOBA scale — used for wRC+
    wOBAScale: 1.157, // recent multi-year average
  };
}

/** Recent transactions across MLB. Source: MLB Stats API /transactions. */
export async function getTransactions(days = 5): Promise<any[]> {
  const today = new Date();
  const start = new Date(today.getTime() - days * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const data = await get<{ transactions: any[] }>(
    `/transactions?startDate=${fmt(start)}&endDate=${fmt(today)}`,
    { revalidate: 1800 }
  ).catch(() => ({ transactions: [] as any[] }));
  return data.transactions ?? [];
}

/** Pitching stats by player — leveraged for bullpen leverage charts. */
export async function getTeamPitchingRoster(teamId: number, season?: number): Promise<any[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<any>(
    `/teams/${teamId}/stats?stats=season&group=pitching&season=${s}&hydrate=team`,
    { revalidate: 600 }
  ).catch(() => null);
  // For a roster-level breakdown, MLB exposes individual stats via roster + each player's pitching split.
  // Cheapest path: use the team roster + each pitcher's season pitching stats, fetched separately.
  return data?.stats?.[0]?.splits ?? [];
}

/** Remaining schedule for a team this season — Monte Carlo input. */
export async function getRemainingSchedule(teamId: number, season?: number): Promise<ScheduleGame[]> {
  const s = season ?? new Date().getFullYear();
  const data = await get<{ dates: ScheduleDate[] }>(
    `/schedule?sportId=1&teamId=${teamId}&season=${s}&hydrate=team`,
    { revalidate: 3600 }
  );
  const today = new Date().toISOString().slice(0, 10);
  return (data.dates ?? [])
    .filter((d) => d.date >= today)
    .flatMap((d) => d.games)
    .filter((g) => g.status.abstractGameState === 'Preview');
}

// ── Game / live feed ────────────────────────────────────────────────────────

export async function getGameLive(gamePk: number): Promise<any> {
  const url = `${BASE_V11}/game/${gamePk}/feed/live`;
  const res = await fetch(url, {
    next: { revalidate: 5, tags: [`game-${gamePk}`] },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`MLB live feed ${res.status} for game ${gamePk}`);
  return res.json();
}


export async function getGameBoxscore(gamePk: number): Promise<any> {
  return get<any>(`/game/${gamePk}/boxscore`, { revalidate: 15 });
}

export async function getGameLinescore(gamePk: number): Promise<any> {
  return get<any>(`/game/${gamePk}/linescore`, { revalidate: 15 });
}

export async function getGameWinProbability(gamePk: number): Promise<any[]> {
  // MLB exposes per-play win probability for completed/live games
  const data = await get<{ winProbability?: any[] }>(`/game/${gamePk}/winProbability`, {
    revalidate: 5,
  });
  return data.winProbability ?? [];
}

// ── Search ──────────────────────────────────────────────────────────────────

export async function searchPlayers(query: string): Promise<Player[]> {
  if (!query || query.length < 2) return [];
  const data = await get<{ people: Player[] }>(
    `/people/search?names=${encodeURIComponent(query)}&sportId=1`,
    { revalidate: 600 }
  ).catch(() => ({ people: [] as Player[] }));
  return data.people ?? [];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function teamLogoUrl(teamId: number, size: 'sm' | 'md' | 'lg' = 'md') {
  const px = size === 'sm' ? 40 : size === 'md' ? 80 : 200;
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

export function teamCapLogoUrl(teamId: number) {
  return `https://www.mlbstatic.com/team-logos/team-cap-on-light/${teamId}.svg`;
}

export function playerHeadshotUrl(playerId: number, size: number = 213) {
  return `https://midfield.mlbstatic.com/v1/people/${playerId}/spots/${size}`;
}
