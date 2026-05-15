import Link from 'next/link';
import {
  getSchedule,
  getStandings,
  getGameLive,
  getPlayerSeasonStats,
  getLastGameForTeam,
} from '@/lib/mlb';
import { getPark, haversineMiles } from '@/lib/parks';
import { fip, parseInnings } from '@/lib/saber';
import { predictFirst5, type First5Input, type WeatherInput } from '@/lib/predict';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LocalDate } from '@/components/LocalDate';
import { First5Card, type First5CardData } from '@/components/First5Card';
import { ymd, shiftYmd } from '@/lib/time';
import { Hourglass, Info } from 'lucide-react';

export const revalidate = 60;
export const metadata = {
  title: 'First 5',
  description: 'First-5-inning predictions for every preview MLB game on the slate.',
};

export default async function First5Page({ searchParams }: { searchParams: { date?: string } }) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : ymd();
  const schedule = await getSchedule(today).catch(() => []);
  // Include all games (preview, live, final) so predictions persist with grading
  const previews = schedule[0]?.games ?? [];
  const standings = await getStandings().catch(() => []);
  const allRecords = standings.flatMap((s) => s.teamRecords);

  const cards: First5CardData[] = await Promise.all(
    previews.map(async (game) => {
      const home = game.teams.home.team;
      const away = game.teams.away.team;
      const [feed, awayLast, awayStarterStats, homeStarterStats] = await Promise.all([
        getGameLive(game.gamePk).catch(() => null),
        getLastGameForTeam(away.id, today).catch(() => null),
        game.teams.away.probablePitcher?.id
          ? getPlayerSeasonStats(game.teams.away.probablePitcher.id, 'pitching').catch(() => null)
          : Promise.resolve(null),
        game.teams.home.probablePitcher?.id
          ? getPlayerSeasonStats(game.teams.home.probablePitcher.id, 'pitching').catch(() => null)
          : Promise.resolve(null),
      ]);

      const venueId = feed?.gameData?.venue?.id ?? game.venue?.id;
      const park = getPark(venueId);
      const wxRaw = feed?.gameData?.weather ?? {};
      const weather: WeatherInput = {
        tempF: wxRaw.temp ? parseInt(wxRaw.temp, 10) : undefined,
        windSpeedMph: wxRaw.wind ? parseInt(wxRaw.wind, 10) : undefined,
        windDir: wxRaw.wind,
        condition: wxRaw.condition,
      };
      const awayPrev = awayLast?.venue?.id ? getPark(awayLast.venue.id) : park;
      const awayTravelMiles = haversineMiles(awayPrev, park);

      const awayRec = allRecords.find((r) => r.team.id === away.id);
      const homeRec = allRecords.find((r) => r.team.id === home.id);
      const teamRate = (rec: any, key: 'runsScored' | 'runsAllowed') => {
        if (!rec) return 4.5;
        const games = rec.wins + rec.losses;
        return games > 0 ? (rec[key] ?? 0) / games : 4.5;
      };
      const starterInput = (sp: any) => {
        if (!sp?.stat) return undefined;
        const f = fip(sp.stat);
        const ip = parseInnings(sp.stat.inningsPitched);
        const gs = Number(sp.stat.gamesStarted) || Number(sp.stat.gamesPlayed) || 1;
        return {
          fip: Number.isFinite(f) && f > 0 ? f : undefined,
          ipPerStart: gs > 0 ? Math.min(7, Math.max(3, ip / gs)) : 5.5,
        };
      };

      const input: First5Input = {
        home: { teamId: home.id, runsScoredPerGame: teamRate(homeRec, 'runsScored'), runsAllowedPerGame: teamRate(homeRec, 'runsAllowed') },
        away: { teamId: away.id, runsScoredPerGame: teamRate(awayRec, 'runsScored'), runsAllowedPerGame: teamRate(awayRec, 'runsAllowed') },
        homeStarter: starterInput(homeStarterStats),
        awayStarter: starterInput(awayStarterStats),
        park,
        weather,
        travel: { awayTravelMiles, awayDaysRest: undefined, homeDaysRest: undefined },
      };
      const output = predictFirst5(input);

      return {
        gamePk: game.gamePk,
        away: { id: away.id, name: away.name, abbr: feed?.gameData?.teams?.away?.abbreviation },
        home: { id: home.id, name: home.name, abbr: feed?.gameData?.teams?.home?.abbreviation },
        gameDate: game.gameDate,
        venueName: feed?.gameData?.venue?.name ?? game.venue?.name,
        awayStarter: game.teams.away.probablePitcher
          ? { id: game.teams.away.probablePitcher.id, name: game.teams.away.probablePitcher.fullName }
          : undefined,
        homeStarter: game.teams.home.probablePitcher
          ? { id: game.teams.home.probablePitcher.id, name: game.teams.home.probablePitcher.fullName }
          : undefined,
        output,
        // Status + actual F5 results
        status: (() => {
          const s = game.status.abstractGameState;
          return s === 'Final' ? 'final' : s === 'Live' ? 'live' : 'preview';
        })() as 'preview' | 'live' | 'final',
        actual: (() => {
          const status = game.status.abstractGameState;
          if (status === 'Preview') return undefined;
          const ls = feed?.liveData?.linescore;
          const innings = ls?.innings ?? [];
          const f5 = innings.slice(0, 5).reduce((s: number, i: any) => s + (i?.away?.runs ?? 0) + (i?.home?.runs ?? 0), 0);
          const currentInning = ls?.currentInning ?? 0;
          const isTopInning = !!ls?.isTopInning;
          const outs = ls?.outs ?? 0;
          const f5Complete = status === 'Final' || currentInning > 5 || (currentInning === 5 && !isTopInning && outs >= 3);
          const firstInning = innings.find((i: any) => i.num === 1);
          const firstInningRuns = (firstInning?.away?.runs ?? 0) + (firstInning?.home?.runs ?? 0);
          const firstInningComplete = status === 'Final' || currentInning > 1 || (currentInning === 1 && !isTopInning && outs >= 3);
          return {
            f5Runs: f5,
            f5Complete,
            firstInningRuns,
            firstInningComplete,
            awayRuns: ls?.teams?.away?.runs ?? 0,
            homeRuns: ls?.teams?.home?.runs ?? 0,
            inningState: ls?.inningState,
            currentInning,
          };
        })(),
      };
    })
  );

  // Sort: live first, then preview by first pitch, then final
  cards.sort((a: any, b: any) => {
    const sr = (s: any) => s === 'live' ? 0 : s === 'preview' ? 1 : 2;
    const r = sr(a.status) - sr(b.status);
    if (r !== 0) return r;
    if (a.status === 'preview') return a.gameDate.localeCompare(b.gameDate);
    return b.output.expectedTotal - a.output.expectedTotal;
  });

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Hourglass size={20} className="text-signal-info" />
            First 5
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            <LocalDate ymd={today} className="stat-num" />
            <span className="px-1 text-ink-faint">·</span>
            <span>{previews.length} preview games · F5 = innings 1 through 5 only</span>
            {previews.length > 0 && (
              <>
                <span className="px-1 text-ink-faint">·</span>
                <AutoRefresh intervalMs={300_000} label="auto-refresh 5m" />
              </>
            )}
          </p>
        </div>
        <DateNav today={today} />
      </div>

      <Panel
        title={<span className="flex items-center gap-2"><Info size={14} className="text-signal-info" /> Why F5 is its own model</span>}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-ink-muted">
          <div>
            <div className="label-micro mb-1">Starter dominates</div>
            In the first 5 innings the starting pitcher carries ~95% of the workload. The bullpen
            barely matters. So this model anchors heavily on each starter's FIP and IP/start —
            unlike the full-game model which blends starter and bullpen.
          </div>
          <div>
            <div className="label-micro mb-1">Modifiers still apply</div>
            Park factor, weather, and umpire effects are scaled to the F5 horizon. Travel/rest
            effects are halved (small-sample concerns). Per-side run distributions assume Poisson
            with overdispersion ψ = 1.4.
          </div>
          <div>
            <div className="label-micro mb-1">What's predicted</div>
            Each game gets: expected F5 runs (per side and total), Home WP through F5, P(NRFI),
            over/under probabilities at common F5 lines (2.5–6.5), and per-starter projected
            K/BB/H/HR/ER through their F5 share. Confidence shown out of 100.
          </div>
        </div>
      </Panel>

      {cards.length === 0 ? (
        <Panel>
          <Empty
            title="No preview games for this date."
            description="Pick another date above."
            icon={<Hourglass size={28} />}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((c) => (
            <First5Card key={c.gamePk} d={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function DateNav({ today }: { today: string }) {
  const yesterday = shiftYmd(today, -1);
  const tomorrow = shiftYmd(today, 1);
  return (
    <div className="flex items-center gap-1 text-2xs">
      <Link href={`/first5?date=${yesterday}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">‹</Link>
      <span className="text-ink-muted px-1 stat-num">{today === ymd() ? 'TODAY' : today}</span>
      <Link href={`/first5?date=${tomorrow}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">›</Link>
    </div>
  );
}
