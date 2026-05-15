import Link from 'next/link';
import {
  getSchedule,
  getGameLive,
  getGameWinProbability,
  teamCapLogoUrl,
} from '@/lib/mlb';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { LiveGameCard, type LiveGameCardData } from '@/components/LiveGameCard';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ymd } from '@/lib/time';
import { LocalTime } from '@/components/LocalTime';
import { LocalDate } from '@/components/LocalDate';
import { Countdown } from '@/components/Countdown';
import { Radio } from 'lucide-react';

export const revalidate = 5;
export const metadata = {
  title: 'Live',
  description: 'Every MLB game currently in progress — live scores, win probability, pitcher/batter matchups.',
};

export default async function LivePage() {
  const today = ymd();
  const schedule = await getSchedule(today).catch(() => []);
  const games = schedule[0]?.games ?? [];
  const live = games.filter((g) => g.status.abstractGameState === 'Live');
  const upcoming = games
    .filter((g) => g.status.abstractGameState === 'Preview')
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const final = games.filter((g) => g.status.abstractGameState === 'Final');

  // Build rich card data for every live game in parallel
  const cards: LiveGameCardData[] = await Promise.all(
    live.map(async (g) => {
      const [feed, wpHistory] = await Promise.all([
        getGameLive(g.gamePk).catch(() => null),
        getGameWinProbability(g.gamePk).catch(() => [] as any[]),
      ]);

      const ls = feed?.liveData?.linescore ?? {};
      const offense = ls.offense ?? {};
      const defense = ls.defense ?? {};
      const currentPlay = feed?.liveData?.plays?.currentPlay;
      const lastPlay = feed?.liveData?.plays?.allPlays?.[(feed?.liveData?.plays?.allPlays?.length ?? 0) - 1];

      const wpSeries: number[] = (wpHistory ?? [])
        .map((p: any) => (typeof p.homeTeamWinProbability === 'number' ? p.homeTeamWinProbability / 100 : null))
        .filter((v: number | null): v is number => v !== null);
      const homeWP = wpSeries.length ? wpSeries[wpSeries.length - 1] : null;

      const desc =
        currentPlay?.result?.description ??
        lastPlay?.result?.description ??
        undefined;

      return {
        gamePk: g.gamePk,
        away: {
          id: g.teams.away.team.id,
          name: g.teams.away.team.name,
          abbr: feed?.gameData?.teams?.away?.abbreviation ?? '',
          score: g.teams.away.score ?? 0,
          record: g.teams.away.leagueRecord
            ? `${g.teams.away.leagueRecord.wins}-${g.teams.away.leagueRecord.losses}`
            : undefined,
        },
        home: {
          id: g.teams.home.team.id,
          name: g.teams.home.team.name,
          abbr: feed?.gameData?.teams?.home?.abbreviation ?? '',
          score: g.teams.home.score ?? 0,
          record: g.teams.home.leagueRecord
            ? `${g.teams.home.leagueRecord.wins}-${g.teams.home.leagueRecord.losses}`
            : undefined,
        },
        inning: ls.currentInning ?? null,
        inningState: ls.inningState ?? '',
        isTopInning: ls.isTopInning ?? false,
        outs: ls.outs ?? 0,
        balls: ls.balls ?? 0,
        strikes: ls.strikes ?? 0,
        onFirst: !!offense.first,
        onSecond: !!offense.second,
        onThird: !!offense.third,
        currentBatter: offense.batter
          ? {
              id: offense.batter.id,
              name: offense.batter.fullName,
            }
          : undefined,
        currentPitcher: defense.pitcher
          ? {
              id: defense.pitcher.id,
              name: defense.pitcher.fullName,
            }
          : undefined,
        homeWP,
        wpSeries: wpSeries.slice(-40),
        lastPlay: desc,
        venue: feed?.gameData?.venue?.name,
      };
    })
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Radio size={20} className={live.length > 0 ? 'text-signal-neg animate-pulse' : 'text-ink-faint'} />
            Live
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            <LocalDate ymd={today} className="stat-num" />
            <span className="px-1 text-ink-faint">·</span>
            {live.length > 0 ? (
              <>
                <Badge variant="neg" pulse>{live.length} live</Badge>
                <span className="px-1 text-ink-faint">·</span>
                <AutoRefresh intervalMs={5_000} label="auto-refresh 5s" />
              </>
            ) : (
              <span className="text-ink-muted">Nothing in progress right now.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-2xs text-ink-muted">
          <div className="flex flex-col items-end">
            <span className="label-micro">Today's slate</span>
            <span className="stat-num text-sm text-ink">{games.length} games</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="label-micro">Upcoming</span>
            <span className="stat-num text-sm text-ink">{upcoming.length}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="label-micro">Final</span>
            <span className="stat-num text-sm text-ink">{final.length}</span>
          </div>
        </div>
      </div>

      {/* Live grid */}
      {cards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((c) => (
            <LiveGameCard key={c.gamePk} d={c} />
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            title="No games in progress."
            description={
              upcoming.length > 0
                ? <>Next first pitch: <LocalTime iso={upcoming[0].gameDate} format="time" className="stat-num" /> · {upcoming[0].teams.away.team.name} @ {upcoming[0].teams.home.team.name}.</>
                : final.length > 0
                ? `All ${final.length} of today's games are final. Check back tomorrow.`
                : 'Off day. The full league is dark.'
            }
            icon={<Radio size={28} />}
          />
        </Panel>
      )}

      {/* Up next */}
      {upcoming.length > 0 && (
        <Panel
          title="Up next today"
          subtitle="First pitch times · click a game for projections"
          flush
        >
          <ul className="divide-y divide-line-subtle">
            {upcoming.slice(0, 8).map((g) => (
              <li key={g.gamePk}>
                <Link href={`/game/${g.gamePk}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                  <div className="w-20">
                    <LocalTime iso={g.gameDate} format="time" className="text-2xs text-ink-faint stat-num block" />
                    <Countdown iso={g.gameDate} status="Preview" className="block" />
                  </div>
                  <img src={teamCapLogoUrl(g.teams.away.team.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                  <span className="text-sm text-ink-muted flex-1 truncate">{g.teams.away.team.name}</span>
                  <span className="text-2xs text-ink-faint">@</span>
                  <img src={teamCapLogoUrl(g.teams.home.team.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                  <span className="text-sm flex-1 truncate">{g.teams.home.team.name}</span>
                  {g.teams.home.probablePitcher && (
                    <span className="text-2xs text-ink-faint truncate hidden md:inline">
                      {g.teams.away.probablePitcher?.fullName ?? 'TBD'} vs {g.teams.home.probablePitcher.fullName}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Recent finals */}
      {final.length > 0 && (
        <Panel title="Today's finals" subtitle={`${final.length} games complete`} flush>
          <ul className="divide-y divide-line-subtle">
            {final.slice(0, 12).map((g) => {
              const a = g.teams.away;
              const h = g.teams.home;
              const aw = (a.score ?? 0) > (h.score ?? 0);
              return (
                <li key={g.gamePk}>
                  <Link href={`/game/${g.gamePk}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                    <Badge>FINAL</Badge>
                    <img src={teamCapLogoUrl(a.team.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                    <span className={`text-sm flex-1 truncate ${aw ? 'text-ink' : 'text-ink-muted'}`}>
                      {a.team.name}
                    </span>
                    <span className={`stat-num text-sm font-semibold w-6 text-right ${aw ? 'text-ink' : 'text-ink-muted'}`}>{a.score}</span>
                    <span className="text-2xs text-ink-faint">·</span>
                    <span className={`stat-num text-sm font-semibold w-6 text-right ${!aw ? 'text-ink' : 'text-ink-muted'}`}>{h.score}</span>
                    <span className={`text-sm flex-1 truncate ${!aw ? 'text-ink' : 'text-ink-muted'}`}>{h.team.name}</span>
                    <img src={teamCapLogoUrl(h.team.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
