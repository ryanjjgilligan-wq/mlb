import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getTeam,
  getRoster,
  getTeamStats,
  getStandings,
  getScheduleRange,
  teamCapLogoUrl,
  playerHeadshotUrl,
} from '@/lib/mlb';
import { Panel } from '@/components/ui/Panel';
import { Stat } from '@/components/ui/Stat';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { Empty } from '@/components/ui/Empty';
import {
  fmtAvg,
  fmtSigned,
  fmtNum,
  pythagorean,
  expectedRecord,
} from '@/lib/saber';
import { shiftYmd, ymd, formatGameTime } from '@/lib/time';

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

  const [team, roster, stats, standings, scheduleRange] = await Promise.all([
    getTeam(id),
    getRoster(id).catch(() => []),
    getTeamStats(id).catch(() => []),
    getStandings().catch(() => []),
    getScheduleRange(start, end).catch(() => []),
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
        <img src={teamCapLogoUrl(team.id)} alt="" className="w-16 h-16 invert opacity-95" />
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
            <Badge>{team.abbreviation}</Badge>
            {team.league && <Badge variant="info">{team.league.name}</Badge>}
            {team.division && <Badge>{team.division.name}</Badge>}
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
                      <img src={teamCapLogoUrl(opp.team.id)} alt="" className="w-4 h-4 invert opacity-80" />
                      <span className="text-sm flex-1 truncate">{opp.team.name}</span>
                      {state === 'Final' ? (
                        <span className={`text-2xs stat-num ${win ? 'text-signal-pos' : loss ? 'text-signal-neg' : 'text-ink-muted'}`}>
                          {win ? 'W' : loss ? 'L' : '—'} {ourScore}-{theirScore}
                        </span>
                      ) : state === 'Live' ? (
                        <Badge variant="neg" pulse>LIVE</Badge>
                      ) : (
                        <span className="text-2xs text-ink-muted stat-num">{formatGameTime(g.gameDate)}</span>
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
      </div>
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
