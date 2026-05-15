import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getTeam,
  getRoster,
  getTeamStats,
  getStandings,
  getScheduleRange,
  getRemainingSchedule,
  getInjuryList,
  getTeamMonthlyHitting,
  getTeamMonthlyPitching,
  teamCapLogoUrl,
  playerHeadshotUrl,
} from '@/lib/mlb';
import { Countdown } from '@/components/Countdown';
import { Panel } from '@/components/ui/Panel';
import { Stat } from '@/components/ui/Stat';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { Empty } from '@/components/ui/Empty';
import { WatchButton } from '@/components/WatchButton';
import { MonteCarloChart } from '@/components/MonteCarloChart';
import {
  fmtAvg,
  fmtSigned,
  fmtNum,
  pythagorean,
  expectedRecord,
} from '@/lib/saber';
import { runMonteCarlo, type SimGame, type SimTeam } from '@/lib/montecarlo';
import { shiftYmd, ymd } from '@/lib/time';
import { LocalTime } from '@/components/LocalTime';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { id: string } }) {
  const team = await getTeam(parseInt(params.id, 10)).catch(() => null);
  return { title: team?.name ?? 'Team' };
}

export default async function TeamPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const today = ymd();
  const start = shiftYmd(today, -3);
  const end = shiftYmd(today, 10);

  const [team, roster, stats, standings, scheduleRange, remainingSchedule, injuries, monthlyHit, monthlyPit] = await Promise.all([
    getTeam(id),
    getRoster(id).catch(() => []),
    getTeamStats(id).catch(() => []),
    getStandings().catch(() => []),
    getScheduleRange(start, end).catch(() => []),
    getRemainingSchedule(id).catch(() => []),
    getInjuryList(id).catch(() => []),
    getTeamMonthlyHitting(id).catch(() => []),
    getTeamMonthlyPitching(id).catch(() => []),
  ]);

  if (!team) notFound();

  // Find this team's standings record
  const record = standings
    .flatMap((d) => d.teamRecords)
    .find((tr) => tr.team.id === id);

  const rs = record?.runsScored ?? 0;
  const ra = record?.runsAllowed ?? 0;
  const w = record?.wins ?? 0;
  const l = record?.losses ?? 0;
  const games = w + l;
  const expRec = expectedRecord(rs, ra, games);
  const pyth = pythagorean(rs, ra);
  const actualPct = parseFloat(record?.winningPercentage ?? '0') || 0;
  const diffPct = actualPct - pyth;

  const hittingSplit = stats.find((s: any) => s.group?.displayName === 'hitting')?.splits?.[0]?.stat ?? {};
  const pitchingSplit = stats.find((s: any) => s.group?.displayName === 'pitching')?.splits?.[0]?.stat ?? {};

  // Monte Carlo final-record sim
  const simTeams: SimTeam[] = standings
    .flatMap((d) => d.teamRecords)
    .map((tr) => ({
      id: tr.team.id,
      name: tr.team.name,
      wins: tr.wins,
      losses: tr.losses,
      pyth: pythagorean(tr.runsScored ?? 0, tr.runsAllowed ?? 0) || 0.5,
    }));
  const simGames: SimGame[] = remainingSchedule
    .filter((g) => g.teams.home?.team?.id && g.teams.away?.team?.id)
    .map((g) => ({ homeId: g.teams.home.team.id, awayId: g.teams.away.team.id }));
  const mcResult = simTeams.length && simGames.length
    ? runMonteCarlo(id, simTeams, simGames, 5000, id)
    : { expectedWins: w, expectedLosses: l, winDistribution: [], iterationsRun: 0 };

  // Identify a playoff-contention threshold from this league using the
  // current 6th-best record in this team's league (approx WC cut).
  const sameLeagueRecords = standings
    .filter((d) => d.league?.id === team.league?.id)
    .flatMap((d) => d.teamRecords)
    .map((tr) => tr.wins + tr.losses ? tr.wins / (tr.wins + tr.losses) : 0);
  const sortedLg = [...sameLeagueRecords].sort((a, b) => b - a);
  const wcCutPct = sortedLg[5] ?? 0.500;
  const totalGames = w + l + remainingSchedule.length;
  const wcCutWins = Math.round(wcCutPct * totalGames);
  const playoffProbability = mcResult.winDistribution.reduce(
    (sum, d) => sum + (d.wins >= wcCutWins ? d.freq : 0),
    0
  );

  // Categorize roster
  const pitchers = roster.filter((r) => r.position.code === '1' || r.position.abbreviation === 'P');
  const position = roster.filter((r) => r.position.code !== '1' && r.position.abbreviation !== 'P');

  // Group upcoming games
  const upcoming = scheduleRange
    .flatMap((d) => d.games.map((g) => ({ ...g, date: d.date })))
    .filter((g) => g.teams.away.team.id === id || g.teams.home.team.id === id)
    .slice(0, 10);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Identity card */}
      <div className="flex flex-wrap items-center gap-5 panel p-5">
        <img src={teamCapLogoUrl(team.id)} alt="" className="w-16 h-16 team-logo opacity-95" />
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
            <Badge>{team.abbreviation}</Badge>
            {team.league && <Badge variant="info">{team.league.name}</Badge>}
            {team.division && <Badge>{team.division.name}</Badge>}
            <span className="ml-auto">
              <WatchButton type="team" id={team.id} name={team.name} meta={team.abbreviation} />
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            {team.venue?.name}
            {team.firstYearOfPlay && <> · est. {team.firstYearOfPlay}</>}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2">
          <Stat label="Record" value={`${w}-${l}`} size="lg" align="right" />
          <Stat
            label="Run Diff"
            value={fmtSigned(rs - ra, 0)}
            size="lg"
            align="right"
            trend={rs - ra > 0 ? 'pos' : rs - ra < 0 ? 'neg' : 'neutral'}
          />
          <Stat
            label="Exp W-L"
            hint={`Pythagorean expected record from ${rs} RS / ${ra} RA, exponent 1.83. Source: Bill James.`}
            value={`${expRec.wins}-${expRec.losses}`}
            size="lg"
            align="right"
          />
          <Stat
            label="vs Exp"
            hint="Actual winning % minus Pythagorean expected. Positive values are over-performance (regression candidate)."
            value={fmtSigned(diffPct * 100, 1)}
            size="lg"
            align="right"
            trend={diffPct > 0.02 ? 'pos' : diffPct < -0.02 ? 'neg' : 'neutral'}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Hitting & Pitching summaries */}
        <Panel className="lg:col-span-6" title="Team Hitting" subtitle="Season-to-date · MLB Stats API">
          <div className="grid grid-cols-4 gap-x-4 gap-y-4">
            <Stat label="AVG" value={hittingSplit.avg ?? '—'} size="md" />
            <Stat label="OBP" value={hittingSplit.obp ?? '—'} size="md" />
            <Stat label="SLG" value={hittingSplit.slg ?? '—'} size="md" />
            <Stat label="OPS" value={hittingSplit.ops ?? '—'} size="md" />
            <Stat label="R" value={hittingSplit.runs ?? '—'} size="md" />
            <Stat label="HR" value={hittingSplit.homeRuns ?? '—'} size="md" />
            <Stat label="SB" value={hittingSplit.stolenBases ?? '—'} size="md" />
            <Stat label="K%" value={hittingSplit.strikeOuts && hittingSplit.plateAppearances ? `${((hittingSplit.strikeOuts / hittingSplit.plateAppearances) * 100).toFixed(1)}%` : '—'} size="md" hint="Strikeouts per plate appearance" />
          </div>
        </Panel>

        <Panel className="lg:col-span-6" title="Team Pitching" subtitle="Season-to-date · MLB Stats API">
          <div className="grid grid-cols-4 gap-x-4 gap-y-4">
            <Stat label="ERA" value={pitchingSplit.era ?? '—'} size="md" />
            <Stat label="WHIP" value={pitchingSplit.whip ?? '—'} size="md" />
            <Stat label="K/9" value={pitchingSplit.strikeoutsPer9Inn ?? '—'} size="md" />
            <Stat label="BB/9" value={pitchingSplit.walksPer9Inn ?? '—'} size="md" />
            <Stat label="IP" value={pitchingSplit.inningsPitched ?? '—'} size="md" />
            <Stat label="K" value={pitchingSplit.strikeOuts ?? '—'} size="md" />
            <Stat label="HR" value={pitchingSplit.homeRuns ?? '—'} size="md" />
            <Stat
              label="OPP. AVG"
              value={pitchingSplit.avg ?? '—'}
              size="md"
              hint="Batting average of opposing hitters"
            />
          </div>
        </Panel>

        {/* Monthly splits — by-month for hitting and pitching */}
        {(monthlyHit.length > 0 || monthlyPit.length > 0) && (
          <Panel
            className="lg:col-span-12"
            title="Month-by-month"
            subtitle="Team hitting + pitching split by calendar month · MLB byMonth endpoint"
            flush
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
              <MonthlyTable splits={monthlyHit} kind="hitting" />
              <MonthlyTable splits={monthlyPit} kind="pitching" />
            </div>
          </Panel>
        )}

        {/* Monte Carlo final-record sim */}
        <Panel
          className="lg:col-span-12"
          title="Playoff projection · Monte Carlo"
          subtitle={
            mcResult.iterationsRun > 0
              ? `${mcResult.iterationsRun.toLocaleString()} sims · Log5 per game with HFA · ${remainingSchedule.length} remaining games`
              : 'Insufficient data'
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <div className="grid grid-cols-2 gap-4 self-start">
              <Stat
                label="Exp. final W-L"
                value={`${mcResult.expectedWins.toFixed(1)}-${mcResult.expectedLosses.toFixed(1)}`}
                size="md"
                hint="Mean across all simulated season completions"
              />
              <Stat
                label="Playoff prob."
                value={`${(playoffProbability * 100).toFixed(1)}%`}
                size="md"
                trend={playoffProbability > 0.5 ? 'pos' : playoffProbability < 0.2 ? 'neg' : 'neutral'}
                hint={`Share of sims with wins ≥ ${wcCutWins} (current 6th-best W% in ${team.league?.name ?? 'league'} × total games)`}
              />
              <Stat
                label="Remaining games"
                value={remainingSchedule.length}
                size="md"
                align="left"
              />
              <Stat
                label="Iterations"
                value={mcResult.iterationsRun.toLocaleString()}
                size="md"
                align="left"
              />
            </div>
            <MonteCarloChart
              distribution={mcResult.winDistribution}
              expectedWins={mcResult.expectedWins}
            />
          </div>
          <p className="text-2xs text-ink-faint mt-3">
            Talent estimator is each club's current-season Pythagorean expected W%. Method and limitations on <Link href="/lab" className="underline">/lab</Link>.
          </p>
        </Panel>

        {/* Schedule */}
        <Panel
          className="lg:col-span-5"
          title="Schedule"
          subtitle="Recent + upcoming · click for game detail"
          flush
        >
          {upcoming.length === 0 ? (
            <Empty title="No scheduled games in this window" />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {upcoming.map((g: any) => {
                const isAway = g.teams.away.team.id === id;
                const opp = isAway ? g.teams.home : g.teams.away;
                const state = g.status.abstractGameState;
                const ourScore = isAway ? g.teams.away.score : g.teams.home.score;
                const theirScore = isAway ? g.teams.home.score : g.teams.away.score;
                const win = state === 'Final' && (ourScore ?? 0) > (theirScore ?? 0);
                const loss = state === 'Final' && (ourScore ?? 0) < (theirScore ?? 0);
                return (
                  <li key={g.gamePk}>
                    <Link href={`/game/${g.gamePk}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                      <span className="text-2xs text-ink-faint stat-num w-12">{g.date.slice(5)}</span>
                      <span className="text-2xs text-ink-muted w-4">{isAway ? '@' : 'vs'}</span>
                      <img src={teamCapLogoUrl(opp.team.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                      <span className="text-sm flex-1 truncate">{opp.team.name}</span>
                      {state === 'Final' ? (
                        <span className={`text-2xs stat-num ${win ? 'text-signal-pos' : loss ? 'text-signal-neg' : 'text-ink-muted'}`}>
                          {win ? 'W' : loss ? 'L' : '—'} {ourScore}-{theirScore}
                        </span>
                      ) : state === 'Live' ? (
                        <Badge variant="neg" pulse>LIVE</Badge>
                      ) : (
                        <div className="flex flex-col items-end">
                          <LocalTime iso={g.gameDate} format="time" className="text-2xs text-ink-muted stat-num" />
                          <Countdown iso={g.gameDate} status="Preview" />
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Roster */}
        <Panel className="lg:col-span-7" title={`Active Roster · ${roster.length} players`} flush>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line-subtle">
            <RosterColumn label="Pitchers" entries={pitchers} />
            <RosterColumn label="Position Players" entries={position} />
          </div>
        </Panel>

        {/* Injury list */}
        <Panel
          className="lg:col-span-12"
          title="Injury list"
          subtitle={injuries.length ? `${injuries.length} players currently on the IL` : 'No active injuries reported'}
          flush
        >
          {injuries.length === 0 ? (
            <Empty title="No active IL placements." description="The full-season roster reports no players currently in an injured/disabled status." />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {injuries.map((p) => (
                <li key={p.person.id}>
                  <Link href={`/player/${p.person.id}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                    <img src={playerHeadshotUrl(p.person.id, 60)} alt="" className="w-7 h-7 rounded-full bg-bg-raised object-cover" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{p.person.fullName}</div>
                      <div className="text-2xs text-ink-faint truncate">{p.position.abbreviation}</div>
                    </div>
                    <Badge variant="warn">{p.status.description}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function MonthlyTable({ splits, kind }: { splits: any[]; kind: 'hitting' | 'pitching' }) {
  const monthName = (m: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? String(m);
  if (!splits.length) {
    return (
      <div className="p-4 text-2xs text-ink-faint text-center">
        No monthly {kind} splits yet this season.
      </div>
    );
  }
  return (
    <div className="p-3">
      <div className="label-micro mb-2 px-1 capitalize">{kind}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
            <th className="text-left font-medium pb-1">Month</th>
            <th className="text-right font-medium pb-1">G</th>
            {kind === 'hitting' ? (
              <>
                <th className="text-right font-medium pb-1">PA</th>
                <th className="text-right font-medium pb-1">R</th>
                <th className="text-right font-medium pb-1">HR</th>
                <th className="text-right font-medium pb-1">AVG</th>
                <th className="text-right font-medium pb-1">OBP</th>
                <th className="text-right font-medium pb-1">SLG</th>
                <th className="text-right font-medium pb-1">OPS</th>
              </>
            ) : (
              <>
                <th className="text-right font-medium pb-1">IP</th>
                <th className="text-right font-medium pb-1">ERA</th>
                <th className="text-right font-medium pb-1">WHIP</th>
                <th className="text-right font-medium pb-1">K/9</th>
                <th className="text-right font-medium pb-1">BB/9</th>
                <th className="text-right font-medium pb-1">OAV</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {splits.map((sp: any, i: number) => {
            const s = sp.stat ?? {};
            const m = sp.month ?? sp.numTeams ?? i + 3;
            return (
              <tr key={i} className="row-hover border-t border-line-subtle">
                <td className="py-1 pr-2 stat-num text-ink">{monthName(Number(m))}</td>
                <td className="text-right stat-num text-ink-muted">{s.gamesPlayed ?? '—'}</td>
                {kind === 'hitting' ? (
                  <>
                    <td className="text-right stat-num text-ink-muted">{s.plateAppearances ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.runs ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.homeRuns ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.avg ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.obp ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.slg ?? '—'}</td>
                    <td className="text-right stat-num text-ink">{s.ops ?? '—'}</td>
                  </>
                ) : (
                  <>
                    <td className="text-right stat-num text-ink-muted">{s.inningsPitched ?? '—'}</td>
                    <td className="text-right stat-num text-ink">{s.era ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.whip ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.strikeoutsPer9Inn ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.walksPer9Inn ?? '—'}</td>
                    <td className="text-right stat-num text-ink-muted">{s.avg ?? '—'}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RosterColumn({
  label,
  entries,
}: {
  label: string;
  entries: Awaited<ReturnType<typeof getRoster>>;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="label-micro">{label}</span>
        <span className="text-2xs text-ink-faint stat-num">{entries.length}</span>
      </div>
      <ul className="space-y-px">
        {[...entries]
          .sort((a, b) => a.person.fullName.localeCompare(b.person.fullName))
          .map((r) => (
            <li key={r.person.id}>
              <Link
                href={`/player/${r.person.id}`}
                className="flex items-center gap-2 px-2 py-1 rounded row-hover"
              >
                <img
                  src={playerHeadshotUrl(r.person.id, 60)}
                  alt=""
                  className="w-7 h-7 rounded-full bg-bg-raised object-cover"
                  loading="lazy"
                />
                <span className="text-sm flex-1 truncate">{r.person.fullName}</span>
                <span className="text-2xs text-ink-faint stat-num w-6 text-right">
                  {r.jerseyNumber ? `#${r.jerseyNumber}` : ''}
                </span>
                <span className="text-2xs text-ink-muted w-8 text-right">{r.position.abbreviation}</span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
