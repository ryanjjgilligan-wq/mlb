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
    { revalidate: 30, tags: ['schedule'] }
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
    next: { revalidate: 15, tags: [`game-${gamePk}`] },
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
    revalidate: 15,
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
