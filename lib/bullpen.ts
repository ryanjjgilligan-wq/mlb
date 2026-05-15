/**
 * Bullpen fatigue tracker.
 *
 * Pulls the last N days of finals for a team, scans every box-score for
 * relievers' workload (pitches and back-to-back-day usage), and produces
 * a per-pitcher availability score plus a team aggregate.
 *
 * Outputs
 * -------
 *   perPitcher: { id, name, throws, pitchesByDay, totalPitches3d,
 *                  appearancesIn3d, b2b, status: 'fresh'|'tired'|'gassed' }
 *   aggregate: { totalPitches3d, gassedCount, freshCount, fatigueScore (0-100) }
 *
 * Method
 * ------
 *   Fresh:  ≤25 pitches in last 3 days AND not pitched yesterday
 *   Tired:  26–55 pitches in last 3 days OR pitched yesterday
 *   Gassed: >55 pitches in last 3 days OR pitched both of the last two days
 *
 * fatigueScore (team aggregate):
 *   100 = fully rested · 0 = severely depleted
 *   = 100 − min(80, totalPitches3d/3) + bonus for gassed/back-to-back arms.
 *
 * Why it matters
 * --------------
 *   A bullpen that's thrown 250+ pitches in the last 3 days will give up
 *   ~0.4 extra runs in the 6th–9th innings versus a fresh pen. That's a
 *   real, measurable late-game edge sharps trade on every day.
 */

import { getScheduleRange, getGameBoxscore } from './mlb';
import { ymd, shiftYmd } from './time';

export type ReliverEntry = {
  id: number;
  name: string;
  throws?: string;
  pitchesByDay: { date: string; pitches: number; outs: number }[];
  totalPitches3d: number;
  appearances3d: number;
  pitchedYesterday: boolean;
  pitchedDayBefore: boolean;
  b2bDays: boolean; // pitched both of the last two days
  status: 'fresh' | 'tired' | 'gassed';
};

export type BullpenSummary = {
  pitchers: ReliverEntry[];
  totalPitches3d: number;
  freshCount: number;
  tiredCount: number;
  gassedCount: number;
  fatigueScore: number; // 100 = fresh, 0 = depleted
  scanWindow: { start: string; end: string };
};

export async function computeBullpenFatigue(teamId: number, today?: string): Promise<BullpenSummary> {
  const t = today ?? ymd();
  const start = shiftYmd(t, -3);
  const end = shiftYmd(t, -1); // we look at games up through yesterday

  const dates = await getScheduleRange(start, end).catch(() => []);
  const teamGames = dates
    .flatMap((d) => d.games.map((g) => ({ ...g, date: d.date })))
    .filter((g) => g.status.abstractGameState === 'Final')
    .filter((g) => g.teams.away.team.id === teamId || g.teams.home.team.id === teamId);

  // Pull boxscores for each game in parallel
  const boxes = await Promise.all(
    teamGames.map(async (g) => ({
      date: g.date,
      box: await getGameBoxscore(g.gamePk).catch(() => null),
      isAway: g.teams.away.team.id === teamId,
    }))
  );

  // Map of pitcherId → entry
  const map = new Map<number, ReliverEntry>();

  for (const { date, box, isAway } of boxes) {
    if (!box) continue;
    const teamBlock = isAway ? box.teams?.away : box.teams?.home;
    if (!teamBlock) continue;

    const pitcherIds: number[] = teamBlock.pitchers ?? [];
    for (const pid of pitcherIds) {
      const player = teamBlock.players?.[`ID${pid}`];
      if (!player) continue;
      const ps = player.stats?.pitching;
      if (!ps) continue;

      // Skip starters: anyone who pitched 5+ innings in this appearance
      // we still tally for fatigue but flag separately so manager doesn't
      // "save" them as if they're available bullpen arms.
      const pitches = Number(ps.pitchesThrown ?? ps.numberOfPitches ?? 0);
      const outs = Number(ps.outs ?? 0);
      if (pitches === 0 && outs === 0) continue;

      const existing: ReliverEntry = map.get(pid) ?? {
        id: pid,
        name: player.person?.fullName ?? `#${pid}`,
        throws: player.pitchHand?.code,
        pitchesByDay: [] as { date: string; pitches: number; outs: number }[],
        totalPitches3d: 0,
        appearances3d: 0,
        pitchedYesterday: false,
        pitchedDayBefore: false,
        b2bDays: false,
        status: 'fresh',
      };

      existing.pitchesByDay.push({ date, pitches, outs });
      existing.totalPitches3d += pitches;
      existing.appearances3d += 1;

      const yesterday = shiftYmd(t, -1);
      const dayBefore = shiftYmd(t, -2);
      if (date === yesterday) existing.pitchedYesterday = true;
      if (date === dayBefore) existing.pitchedDayBefore = true;
      existing.b2bDays = existing.pitchedYesterday && existing.pitchedDayBefore;

      // Recompute status
      if (existing.totalPitches3d > 55 || existing.b2bDays) {
        existing.status = 'gassed';
      } else if (existing.totalPitches3d > 25 || existing.pitchedYesterday) {
        existing.status = 'tired';
      } else {
        existing.status = 'fresh';
      }

      map.set(pid, existing);
    }
  }

  // Filter out starters: anyone whose largest single-day workload was 70+ pitches
  // is treated as a starter, not a bullpen arm. They're not available today.
  const allArms = Array.from(map.values());
  const relievers = allArms.filter((p) => Math.max(0, ...p.pitchesByDay.map((d) => d.pitches)) < 70);

  const totalPitches3d = relievers.reduce((s, p) => s + p.totalPitches3d, 0);
  const freshCount = relievers.filter((p) => p.status === 'fresh').length;
  const tiredCount = relievers.filter((p) => p.status === 'tired').length;
  const gassedCount = relievers.filter((p) => p.status === 'gassed').length;

  // fatigueScore: start at 100, subtract for total workload + heavy users
  const workloadPenalty = Math.min(60, totalPitches3d / 4); // every 4 pitches knocks 1 point, capped 60
  const gassedPenalty = gassedCount * 8;
  const tiredPenalty = tiredCount * 3;
  const fatigueScore = Math.max(0, Math.round(100 - workloadPenalty - gassedPenalty - tiredPenalty));

  return {
    pitchers: relievers.sort((a, b) => b.totalPitches3d - a.totalPitches3d),
    totalPitches3d,
    freshCount,
    tiredCount,
    gassedCount,
    fatigueScore,
    scanWindow: { start, end },
  };
}
