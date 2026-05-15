import Link from 'next/link';
import {
  getSchedule,
  getStandings,
  getGameLive,
  getPlayerSeasonStats,
  getLastGameForTeam,
  getPlayerLastXGames,
  getTeamLastXGamesHitting,
  getTeamLastXGamesPitching,
  teamCapLogoUrl,
} from '@/lib/mlb';
import { getPark, haversineMiles } from '@/lib/parks';
import { fip, parseInnings } from '@/lib/saber';
import { predictFirst5, type First5Input, type WeatherInput } from '@/lib/predict';
import { blendStats, recencyWeightedFIP } from '@/lib/recency';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LocalDate } from '@/components/LocalDate';
import { LocalTime } from '@/components/LocalTime';
import { Countdown } from '@/components/Countdown';
import { ymd, shiftYmd } from '@/lib/time';
import { Shield, Info, ChevronRight } from 'lucide-react';

export const revalidate = 600;
export const metadata = {
  title: 'NRFI / YRFI',
  description: 'No-Run / Yes-Run First Inning edge finder for the day\'s slate.',
};

export default async function NrfiPage({ searchParams }: { searchParams: { date?: string } }) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : ymd();
  const schedule = await getSchedule(today).catch(() => []);
  const previews = (schedule[0]?.games ?? []).filter((g) => g.status.abstractGameState === 'Preview');
  const standings = await getStandings().catch(() => []);
  const allRecords = standings.flatMap((s) => s.teamRecords);

  // Build F5 prediction for each game (we need the NRFI probability) — same plumbing as /first5
  const rows = await Promise.all(
    previews.map(async (game) => {
      const home = game.teams.home.team;
      const away = game.teams.away.team;
      const [feed, awayStarterStats, homeStarterStats, awayStarterLast4, homeStarterLast4,
             awayHitL15, awayHitL30, awayPitL15, awayPitL30,
             homeHitL15, homeHitL30, homePitL15, homePitL30] = await Promise.all([
        getGameLive(game.gamePk).catch(() => null),
        game.teams.away.probablePitcher?.id ? getPlayerSeasonStats(game.teams.away.probablePitcher.id, 'pitching').catch(() => null) : Promise.resolve(null),
        game.teams.home.probablePitcher?.id ? getPlayerSeasonStats(game.teams.home.probablePitcher.id, 'pitching').catch(() => null) : Promise.resolve(null),
        game.teams.away.probablePitcher?.id ? getPlayerLastXGames(game.teams.away.probablePitcher.id, 'pitching', 4).catch(() => null) : Promise.resolve(null),
        game.teams.home.probablePitcher?.id ? getPlayerLastXGames(game.teams.home.probablePitcher.id, 'pitching', 4).catch(() => null) : Promise.resolve(null),
        getTeamLastXGamesHitting(away.id, 15).catch(() => null),
        getTeamLastXGamesHitting(away.id, 30).catch(() => null),
        getTeamLastXGamesPitching(away.id, 15).catch(() => null),
        getTeamLastXGamesPitching(away.id, 30).catch(() => null),
        getTeamLastXGamesHitting(home.id, 15).catch(() => null),
        getTeamLastXGamesHitting(home.id, 30).catch(() => null),
        getTeamLastXGamesPitching(home.id, 15).catch(() => null),
        getTeamLastXGamesPitching(home.id, 30).catch(() => null),
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

      const seasonOff = (rec: any) => rec ? { runs: rec.runsScored ?? 0, gamesPlayed: rec.wins + rec.losses } : null;
      const seasonDef = (rec: any) => rec ? { runs: rec.runsAllowed ?? 0, gamesPlayed: rec.wins + rec.losses } : null;
      const blendRPG = (l15: any, l30: any, s: any) => {
        const b = blendStats(l15, l30, s);
        const g = Number(b.gamesPlayed) || 0;
        const r = Number(b.runs) || 0;
        return g > 0 ? r / g : null;
      };
      const awayRec = allRecords.find((r) => r.team.id === away.id);
      const homeRec = allRecords.find((r) => r.team.id === home.id);
      const teamRate = (rec: any, key: string) => {
        if (!rec) return 4.5;
        const games = rec.wins + rec.losses;
        return games > 0 ? (rec[key] ?? 0) / games : 4.5;
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

      const input: First5Input = {
        home: { teamId: home.id, runsScoredPerGame: homeRS, runsAllowedPerGame: homeRA },
        away: { teamId: away.id, runsScoredPerGame: awayRS, runsAllowedPerGame: awayRA },
        homeStarter: starterInput(homeStarterStats, homeStarterLast4),
        awayStarter: starterInput(awayStarterStats, awayStarterLast4),
        park,
        weather,
      };
      const out = predictFirst5(input);

      return {
        gamePk: game.gamePk,
        away: { id: away.id, name: away.name, abbr: feed?.gameData?.teams?.away?.abbreviation },
        home: { id: home.id, name: home.name, abbr: feed?.gameData?.teams?.home?.abbreviation },
        gameDate: game.gameDate,
        venueName: feed?.gameData?.venue?.name ?? game.venue?.name,
        awayStarter: game.teams.away.probablePitcher?.fullName,
        homeStarter: game.teams.home.probablePitcher?.fullName,
        pNRFI: out.pNRFI,
        pYRFI: 1 - out.pNRFI,
        confidence: out.confidence.level,
        confidenceScore: out.confidence.score,
        starterFips: {
          away: input.awayStarter?.fip,
          home: input.homeStarter?.fip,
        },
      };
    })
  );

  // NRFI plays = highest pNRFI (best chance of no runs in 1st)
  // YRFI plays = highest pYRFI (best chance of runs in 1st)
  const sortedNRFI = [...rows].sort((a, b) => b.pNRFI - a.pNRFI);
  const sortedYRFI = [...rows].sort((a, b) => b.pYRFI - a.pYRFI);

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-signal-info" />
            NRFI / YRFI
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            <LocalDate ymd={today} className="stat-num" />
            <span className="px-1 text-ink-faint">·</span>
            <span>{rows.length} preview games · sorted by 1st-inning edge</span>
            {rows.length > 0 && (
              <>
                <span className="px-1 text-ink-faint">·</span>
                <AutoRefresh intervalMs={300_000} label="auto-refresh 5m" />
              </>
            )}
          </p>
        </div>
        <DateNav today={today} />
      </div>

      <Panel title={<span className="flex items-center gap-2"><Info size={14} className="text-signal-info" /> What you're looking at</span>}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-ink-muted">
          <div>
            <div className="label-micro mb-1">NRFI</div>
            "No Runs in First Inning." Bet that neither team scores in the 1st. Wins more often than
            you'd think — historically about 56–58% of MLB first innings are scoreless. Edge appears
            when both starters are above-average.
          </div>
          <div>
            <div className="label-micro mb-1">YRFI</div>
            "Yes Runs in First Inning." Bet that at least one run scores in the 1st. Edge appears
            when one or both starters are below-average and the lineup at the top of the order is
            strong (top of the order = team's best hitters facing a fresh, possibly poor, pitcher).
          </div>
          <div>
            <div className="label-micro mb-1">How we model it</div>
            P(NRFI) = exp(−λ₁) where λ₁ is the projected total runs in inning 1, derived from the
            F5 model's λ÷5. Sharper starter FIPs and pitcher-friendly conditions push P(NRFI) up.
          </div>
        </div>
      </Panel>

      {rows.length === 0 ? (
        <Panel>
          <Empty title="No preview games for this date." description="Pick another date above." icon={<Shield size={28} />} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title={<span className="text-signal-pos">Best NRFI plays</span>}
            subtitle="Highest P(no run in 1st) · pitcher's-duel setups"
            flush
          >
            <NrfiTable rows={sortedNRFI.slice(0, 10)} flavor="nrfi" />
          </Panel>
          <Panel
            title={<span className="text-signal-neg">Best YRFI plays</span>}
            subtitle="Highest P(run in 1st) · weak-starter / strong-offense setups"
            flush
          >
            <NrfiTable rows={sortedYRFI.slice(0, 10)} flavor="yrfi" />
          </Panel>
        </div>
      )}
    </div>
  );
}

function NrfiTable({ rows, flavor }: { rows: any[]; flavor: 'nrfi' | 'yrfi' }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
          <th className="text-left font-medium px-3 py-2">Game</th>
          <th className="text-right font-medium px-2 py-2">{flavor === 'nrfi' ? 'P(NRFI)' : 'P(YRFI)'}</th>
          <th className="text-right font-medium px-2 py-2">Conf.</th>
          <th className="text-right font-medium px-3 py-2">First pitch</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const prob = flavor === 'nrfi' ? r.pNRFI : r.pYRFI;
          return (
            <tr key={r.gamePk} className="row-hover border-b border-line-subtle last:border-0">
              <td className="px-3 py-1.5">
                <Link href={`/game/${r.gamePk}`} className="flex items-center gap-2 hover:text-accent">
                  <img src={teamCapLogoUrl(r.away.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                  <span className="text-ink-muted text-2xs">{r.away.abbr ?? r.away.name}</span>
                  <span className="text-ink-faint text-2xs">@</span>
                  <img src={teamCapLogoUrl(r.home.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                  <span className="text-2xs">{r.home.abbr ?? r.home.name}</span>
                </Link>
                <div className="text-2xs text-ink-faint truncate mt-0.5">
                  {r.awayStarter ?? 'TBD'} vs {r.homeStarter ?? 'TBD'}
                </div>
              </td>
              <td className="text-right px-2 py-1.5">
                <span className={`stat-num text-base font-semibold ${
                  prob > 0.65 ? 'text-signal-pos' : prob > 0.55 ? 'text-ink' : 'text-ink-muted'
                }`}>
                  {(prob * 100).toFixed(1)}%
                </span>
              </td>
              <td className="text-right px-2 py-1.5">
                <ConfidencePill level={r.confidence} score={r.confidenceScore} />
              </td>
              <td className="text-right px-3 py-1.5">
                <LocalTime iso={r.gameDate} format="time" className="text-2xs text-ink-muted stat-num block" />
                <Countdown iso={r.gameDate} status="Preview" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ConfidencePill({ level, score }: { level: 'low' | 'medium' | 'high'; score: number }) {
  const cls =
    level === 'high' ? 'border-signal-pos/40 text-signal-pos' :
    level === 'medium' ? 'border-signal-info/40 text-signal-info' :
    'border-line text-ink-muted';
  return (
    <span className={`inline-flex items-center gap-1 px-1 py-0 rounded border text-[9px] uppercase tracking-micro ${cls}`}>
      {level} · {score}
    </span>
  );
}

function DateNav({ today }: { today: string }) {
  const yesterday = shiftYmd(today, -1);
  const tomorrow = shiftYmd(today, 1);
  return (
    <div className="flex items-center gap-1 text-2xs">
      <Link href={`/nrfi?date=${yesterday}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">‹</Link>
      <span className="text-ink-muted px-1 stat-num">{today === ymd() ? 'TODAY' : today}</span>
      <Link href={`/nrfi?date=${tomorrow}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">›</Link>
    </div>
  );
}
