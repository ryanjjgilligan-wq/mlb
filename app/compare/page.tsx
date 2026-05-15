import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { EntityPicker } from '@/components/EntityPicker';
import { CompareBar } from '@/components/CompareBar';
import {
  getPlayer,
  getPlayerSeasonStats,
  getTeam,
  getStandings,
  getTeamStats,
  getLeagueContext,
  playerHeadshotUrl,
  teamCapLogoUrl,
} from '@/lib/mlb';
import {
  woba, fip, whip, k9, bb9, hr9, kRate, bbRate, iso, babip,
  pythagorean, fmtAvg, fmtNum, fmtPct,
} from '@/lib/saber';
import { wRCPlus, opsPlus, eraMinus } from '@/lib/leagueAdj';
import { GitCompare } from 'lucide-react';

export const revalidate = 600;
export const metadata = { title: 'Compare' };

type Mode = 'hitter' | 'pitcher' | 'team';

const PALETTE = ['#facc15', '#34d399', '#60a5fa', '#f472b6'];

export default async function ComparePage({ searchParams }: { searchParams: { players?: string; teams?: string; mode?: string } }) {
  const mode: Mode = searchParams.mode === 'pitcher' ? 'pitcher' : searchParams.mode === 'team' ? 'team' : 'hitter';

  const playerIds = (searchParams.players ?? '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 4);
  const teamIds = (searchParams.teams ?? '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 4);

  // Fetch in parallel
  const [players, teams, lgCtx, standings] = await Promise.all([
    Promise.all(playerIds.map(async (id) => {
      const [p, hit, pit] = await Promise.all([
        getPlayer(id).catch(() => null),
        getPlayerSeasonStats(id, 'hitting').catch(() => null),
        getPlayerSeasonStats(id, 'pitching').catch(() => null),
      ]);
      return p ? { player: p, hitting: hit, pitching: pit } : null;
    })),
    Promise.all(teamIds.map(async (id) => {
      const [t, stats] = await Promise.all([
        getTeam(id).catch(() => null),
        getTeamStats(id).catch(() => []),
      ]);
      return t ? { team: t, stats } : null;
    })),
    getLeagueContext().catch(() => null),
    teamIds.length ? getStandings().catch(() => []) : Promise.resolve([]),
  ]);

  const validPlayers = players.filter((p): p is NonNullable<typeof p> => !!p);
  const validTeams = teams.filter((t): t is NonNullable<typeof t> => !!t);

  // Picker state — both players and teams ever shown so user can swap modes without losing selections
  const pickerCurrent = [
    ...validPlayers.map((p) => ({
      type: 'player' as const,
      id: p.player.id,
      name: p.player.fullName,
      meta: p.player.currentTeam?.name,
    })),
    ...validTeams.map((t) => ({
      type: 'team' as const,
      id: t.team.id,
      name: t.team.name,
      meta: t.team.abbreviation,
    })),
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <GitCompare size={20} className="text-accent" />
          Compare
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Pick up to 4 players or teams. URL is shareable. Swap modes between hitter / pitcher / team —
          selections persist.
        </p>
      </div>

      <Panel>
        <EntityPicker current={pickerCurrent} mode={mode} />
      </Panel>

      {mode === 'team' ? (
        validTeams.length === 0 ? (
          <EmptyPicker label="teams" />
        ) : (
          <TeamCompare teams={validTeams} standings={standings} />
        )
      ) : validPlayers.length === 0 ? (
        <EmptyPicker label="players" />
      ) : mode === 'pitcher' ? (
        <PitcherCompare players={validPlayers} lgCtx={lgCtx} />
      ) : (
        <HitterCompare players={validPlayers} lgCtx={lgCtx} />
      )}
    </div>
  );
}

function EmptyPicker({ label }: { label: string }) {
  return (
    <Panel>
      <Empty
        title={`Add ${label} to compare.`}
        description="Use the picker above to choose 2–4 entities. The URL will update so the comparison is shareable."
        icon={<GitCompare size={28} />}
      />
    </Panel>
  );
}

// ── Player comparison helpers ────────────────────────────────────────────────

function PlayerHeader({ p, color }: { p: { player: any; hitting: any; pitching: any }; color: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-line">
      <span className="w-1 h-8 rounded" style={{ background: color }} />
      <img src={playerHeadshotUrl(p.player.id, 80)} alt="" className="w-9 h-9 rounded-full bg-bg-raised object-cover" />
      <div className="min-w-0">
        <Link href={`/player/${p.player.id}`} className="text-sm font-medium hover:text-accent truncate block">
          {p.player.fullName}
        </Link>
        <div className="text-2xs text-ink-faint truncate">
          {p.player.primaryPosition?.abbreviation} · {p.player.currentTeam?.name ?? '—'}
        </div>
      </div>
    </div>
  );
}

function HitterCompare({
  players,
  lgCtx,
}: {
  players: { player: any; hitting: any; pitching: any }[];
  lgCtx: Awaited<ReturnType<typeof getLeagueContext>> | null;
}) {
  const colors = players.map((_, i) => PALETTE[i % PALETTE.length]);
  const hittingStats = players.map((p) => p.hitting?.stat ?? {});

  const valuesOf = (extractor: (s: any) => number) =>
    players.map((p, i) => ({ entityKey: String(p.player.id), value: extractor(hittingStats[i]), color: colors[i] }));

  return (
    <>
      {/* Identity strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-line panel overflow-hidden">
        {players.map((p, i) => (
          <div key={p.player.id} className="bg-bg-panel">
            <PlayerHeader p={p} color={colors[i]} />
            <div className="grid grid-cols-3 gap-2 p-3 text-center">
              <Stat label="AVG" value={hittingStats[i].avg ?? '—'} />
              <Stat label="OBP" value={hittingStats[i].obp ?? '—'} />
              <Stat label="SLG" value={hittingStats[i].slg ?? '—'} />
              <Stat label="OPS" value={hittingStats[i].ops ?? '—'} />
              <Stat label="HR" value={hittingStats[i].homeRuns ?? '—'} />
              <Stat label="RBI" value={hittingStats[i].rbi ?? '—'} />
              {lgCtx && (
                <>
                  <Stat label="wRC+" value={Math.round(wRCPlus(hittingStats[i], lgCtx))} accent={wRCPlus(hittingStats[i], lgCtx) > 110} />
                  <Stat label="OPS+" value={Math.round(opsPlus(hittingStats[i], lgCtx))} accent={opsPlus(hittingStats[i], lgCtx) > 110} />
                  <Stat label="K%" value={fmtPct(kRate(hittingStats[i]))} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Panel title="Side-by-side rate stats" subtitle="Higher bar = leader · gray bars are non-leaders">
        <div className="space-y-1">
          <CompareBar
            label="AVG"
            values={valuesOf((s) => parseFloat(s.avg ?? '0'))}
            format={(v) => fmtAvg(v)}
            domain={[0.150, 0.380]}
          />
          <CompareBar label="OBP" values={valuesOf((s) => parseFloat(s.obp ?? '0'))} format={fmtAvg} domain={[0.230, 0.450]} />
          <CompareBar label="SLG" values={valuesOf((s) => parseFloat(s.slg ?? '0'))} format={fmtAvg} domain={[0.280, 0.650]} />
          <CompareBar label="OPS" values={valuesOf((s) => parseFloat(s.ops ?? '0'))} format={fmtAvg} domain={[0.510, 1.100]} />
          <CompareBar label="ISO" values={valuesOf((s) => iso(s))} format={fmtAvg} domain={[0.050, 0.300]} />
          <CompareBar label="wOBA" values={valuesOf((s) => woba(s))} format={fmtAvg} domain={[0.250, 0.450]} hint="Weighted On-Base Average — single best top-line offensive number" />
          <CompareBar label="BABIP" values={valuesOf((s) => babip(s))} format={fmtAvg} domain={[0.220, 0.400]} />
          <CompareBar label="K%" values={valuesOf((s) => kRate(s) * 100)} format={(v) => `${v.toFixed(1)}%`} domain={[10, 35]} lowerIsBetter />
          <CompareBar label="BB%" values={valuesOf((s) => bbRate(s) * 100)} format={(v) => `${v.toFixed(1)}%`} domain={[3, 17]} />
          {lgCtx && (
            <>
              <CompareBar
                label="wRC+ (lg-adj)"
                values={valuesOf((s) => wRCPlus(s, lgCtx))}
                format={(v) => Math.round(v).toString()}
                domain={[60, 180]}
                hint="100 = MLB average. Park-neutral here."
              />
              <CompareBar
                label="OPS+ (lg-adj)"
                values={valuesOf((s) => opsPlus(s, lgCtx))}
                format={(v) => Math.round(v).toString()}
                domain={[60, 180]}
              />
            </>
          )}
        </div>
      </Panel>

      <Panel title="Counting stats" flush>
        <CountingTable
          rows={players.map((p, i) => ({
            label: p.player.fullName,
            color: colors[i],
            stats: p.hitting?.stat ?? {},
          }))}
          columns={[
            { key: 'gamesPlayed', label: 'G' },
            { key: 'plateAppearances', label: 'PA' },
            { key: 'atBats', label: 'AB' },
            { key: 'runs', label: 'R' },
            { key: 'hits', label: 'H' },
            { key: 'doubles', label: '2B' },
            { key: 'triples', label: '3B' },
            { key: 'homeRuns', label: 'HR' },
            { key: 'rbi', label: 'RBI' },
            { key: 'stolenBases', label: 'SB' },
            { key: 'baseOnBalls', label: 'BB' },
            { key: 'strikeOuts', label: 'SO' },
          ]}
        />
      </Panel>
    </>
  );
}

function PitcherCompare({
  players,
  lgCtx,
}: {
  players: { player: any; hitting: any; pitching: any }[];
  lgCtx: Awaited<ReturnType<typeof getLeagueContext>> | null;
}) {
  const colors = players.map((_, i) => PALETTE[i % PALETTE.length]);
  const pitchingStats = players.map((p) => p.pitching?.stat ?? {});

  const valuesOf = (extractor: (s: any) => number) =>
    players.map((p, i) => ({ entityKey: String(p.player.id), value: extractor(pitchingStats[i]), color: colors[i] }));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-line panel overflow-hidden">
        {players.map((p, i) => (
          <div key={p.player.id} className="bg-bg-panel">
            <PlayerHeader p={p} color={colors[i]} />
            <div className="grid grid-cols-3 gap-2 p-3 text-center">
              <Stat label="ERA" value={pitchingStats[i].era ?? '—'} />
              <Stat label="WHIP" value={pitchingStats[i].whip ?? '—'} />
              <Stat label="W-L" value={`${pitchingStats[i].wins ?? '—'}-${pitchingStats[i].losses ?? '—'}`} />
              <Stat label="IP" value={pitchingStats[i].inningsPitched ?? '—'} />
              <Stat label="K" value={pitchingStats[i].strikeOuts ?? '—'} />
              <Stat label="FIP" value={fmtNum(fip(pitchingStats[i]), 2)} />
              {lgCtx && (
                <>
                  <Stat label="ERA−" value={Math.round(eraMinus(parseFloat(pitchingStats[i].era ?? '99'), lgCtx))} accent={eraMinus(parseFloat(pitchingStats[i].era ?? '99'), lgCtx) < 90} />
                  <Stat label="K/9" value={fmtNum(k9(pitchingStats[i]), 1)} />
                  <Stat label="BB/9" value={fmtNum(bb9(pitchingStats[i]), 1)} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Panel title="Side-by-side rate stats" subtitle="Higher bar = leader · for ERA / WHIP / FIP / BB-9, leader is the LOWER value (visually inverted)">
        <div className="space-y-1">
          <CompareBar
            label="ERA"
            values={valuesOf((s) => parseFloat(s.era ?? '99'))}
            format={(v) => v.toFixed(2)}
            domain={[1.5, 7.0]}
            lowerIsBetter
          />
          <CompareBar
            label="WHIP"
            values={valuesOf((s) => whip(s))}
            format={(v) => v.toFixed(2)}
            domain={[0.85, 1.70]}
            lowerIsBetter
          />
          <CompareBar
            label="FIP"
            values={valuesOf((s) => fip(s))}
            format={(v) => v.toFixed(2)}
            domain={[2.0, 6.0]}
            lowerIsBetter
          />
          <CompareBar
            label="K/9"
            values={valuesOf((s) => k9(s))}
            format={(v) => v.toFixed(1)}
            domain={[5, 14]}
          />
          <CompareBar
            label="BB/9"
            values={valuesOf((s) => bb9(s))}
            format={(v) => v.toFixed(1)}
            domain={[1, 6]}
            lowerIsBetter
          />
          <CompareBar
            label="HR/9"
            values={valuesOf((s) => hr9(s))}
            format={(v) => v.toFixed(2)}
            domain={[0.5, 2.2]}
            lowerIsBetter
          />
          <CompareBar
            label="K/BB"
            values={valuesOf((s) => (s.strikeOuts && s.baseOnBalls ? Number(s.strikeOuts) / Number(s.baseOnBalls) : 0))}
            format={(v) => v.toFixed(2)}
            domain={[1, 8]}
          />
          {lgCtx && (
            <CompareBar
              label="ERA− (lg-adj)"
              values={valuesOf((s) => eraMinus(parseFloat(s.era ?? '99'), lgCtx))}
              format={(v) => Math.round(v).toString()}
              domain={[40, 160]}
              lowerIsBetter
              hint="100 = MLB average. Lower is better."
            />
          )}
        </div>
      </Panel>

      <Panel title="Counting stats" flush>
        <CountingTable
          rows={players.map((p, i) => ({
            label: p.player.fullName,
            color: colors[i],
            stats: p.pitching?.stat ?? {},
          }))}
          columns={[
            { key: 'gamesPlayed', label: 'G' },
            { key: 'gamesStarted', label: 'GS' },
            { key: 'inningsPitched', label: 'IP' },
            { key: 'wins', label: 'W' },
            { key: 'losses', label: 'L' },
            { key: 'saves', label: 'SV' },
            { key: 'qualityStarts', label: 'QS' },
            { key: 'strikeOuts', label: 'K' },
            { key: 'baseOnBalls', label: 'BB' },
            { key: 'hits', label: 'H' },
            { key: 'homeRuns', label: 'HR' },
            { key: 'earnedRuns', label: 'ER' },
          ]}
        />
      </Panel>
    </>
  );
}

function TeamCompare({
  teams,
  standings,
}: {
  teams: { team: any; stats: any[] }[];
  standings: any[];
}) {
  const colors = teams.map((_, i) => PALETTE[i % PALETTE.length]);
  const allRecords = standings.flatMap((d: any) => d.teamRecords);
  const teamRecord = (id: number) => allRecords.find((r: any) => r.team.id === id);

  const hittingStat = (i: number) =>
    teams[i].stats.find((s: any) => s.group?.displayName === 'hitting')?.splits?.[0]?.stat ?? {};
  const pitchingStat = (i: number) =>
    teams[i].stats.find((s: any) => s.group?.displayName === 'pitching')?.splits?.[0]?.stat ?? {};

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-line panel overflow-hidden">
        {teams.map((t, i) => {
          const r = teamRecord(t.team.id);
          const w = r?.wins ?? 0;
          const l = r?.losses ?? 0;
          const rs = r?.runsScored ?? 0;
          const ra = r?.runsAllowed ?? 0;
          const pyth = pythagorean(rs, ra);
          return (
            <div key={t.team.id} className="bg-bg-panel">
              <div className="flex items-center gap-3 px-3 py-2.5 border-b border-line">
                <span className="w-1 h-8 rounded" style={{ background: colors[i] }} />
                <img src={teamCapLogoUrl(t.team.id)} alt="" className="w-7 h-7 team-logo opacity-90" />
                <div className="min-w-0">
                  <Link href={`/team/${t.team.id}`} className="text-sm font-medium hover:text-accent truncate block">
                    {t.team.name}
                  </Link>
                  <div className="text-2xs text-ink-faint truncate">{t.team.division?.name}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 p-3 text-center">
                <Stat label="W-L" value={`${w}-${l}`} />
                <Stat label="W%" value={r?.winningPercentage ?? '—'} />
                <Stat label="RD" value={(rs - ra > 0 ? '+' : '') + (rs - ra)} accent={rs - ra > 0} />
                <Stat label="RS/G" value={(w + l > 0 ? rs / (w + l) : 0).toFixed(2)} />
                <Stat label="RA/G" value={(w + l > 0 ? ra / (w + l) : 0).toFixed(2)} />
                <Stat label="Pyth" value={fmtAvg(pyth)} />
              </div>
            </div>
          );
        })}
      </div>

      <Panel title="Team hitting · side-by-side">
        <div className="space-y-1">
          <CompareBar label="AVG" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(hittingStat(i).avg ?? '0'), color: colors[i] }))} format={fmtAvg} domain={[0.220, 0.290]} />
          <CompareBar label="OBP" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(hittingStat(i).obp ?? '0'), color: colors[i] }))} format={fmtAvg} domain={[0.290, 0.360]} />
          <CompareBar label="SLG" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(hittingStat(i).slg ?? '0'), color: colors[i] }))} format={fmtAvg} domain={[0.350, 0.470]} />
          <CompareBar label="OPS" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(hittingStat(i).ops ?? '0'), color: colors[i] }))} format={fmtAvg} domain={[0.640, 0.830]} />
          <CompareBar label="HR" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: Number(hittingStat(i).homeRuns ?? 0), color: colors[i] }))} format={(v) => v.toFixed(0)} />
          <CompareBar label="Runs" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: Number(hittingStat(i).runs ?? 0), color: colors[i] }))} format={(v) => v.toFixed(0)} />
        </div>
      </Panel>

      <Panel title="Team pitching · side-by-side" subtitle="ERA / WHIP / OAvg are inverted — LOWER is leader">
        <div className="space-y-1">
          <CompareBar label="ERA" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(pitchingStat(i).era ?? '99'), color: colors[i] }))} format={(v) => v.toFixed(2)} domain={[2.5, 5.5]} lowerIsBetter />
          <CompareBar label="WHIP" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(pitchingStat(i).whip ?? '99'), color: colors[i] }))} format={(v) => v.toFixed(2)} domain={[1.05, 1.55]} lowerIsBetter />
          <CompareBar label="K/9" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(pitchingStat(i).strikeoutsPer9Inn ?? '0'), color: colors[i] }))} format={(v) => v.toFixed(1)} domain={[7, 11]} />
          <CompareBar label="BB/9" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(pitchingStat(i).walksPer9Inn ?? '0'), color: colors[i] }))} format={(v) => v.toFixed(1)} domain={[2, 4.5]} lowerIsBetter />
          <CompareBar label="OAvg" values={teams.map((t, i) => ({ entityKey: String(t.team.id), value: parseFloat(pitchingStat(i).avg ?? '0'), color: colors[i] }))} format={fmtAvg} domain={[0.220, 0.280]} lowerIsBetter />
        </div>
      </Panel>
    </>
  );
}

// ── small helpers ────────────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="label-micro">{label}</span>
      <span className={`stat-num text-sm font-medium ${accent ? 'text-signal-pos' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

function CountingTable({
  rows,
  columns,
}: {
  rows: { label: string; color: string; stats: Record<string, any> }[];
  columns: { key: string; label: string }[];
}) {
  // Find the leader for each numeric column to bold
  const leaders: Record<string, number> = {};
  for (const c of columns) {
    let best = -Infinity;
    let bestIdx = -1;
    rows.forEach((r, i) => {
      const v = parseFloat(String(r.stats[c.key] ?? ''));
      if (Number.isFinite(v) && v > best) { best = v; bestIdx = i; }
    });
    leaders[c.key] = bestIdx;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
            <th className="text-left font-medium px-3 py-2">Player / Team</th>
            {columns.map((c) => (
              <th key={c.key} className="text-right font-medium px-2 py-2">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label + i} className="row-hover border-b border-line-subtle last:border-0">
              <td className="px-3 py-1.5 flex items-center gap-2">
                <span className="w-1 h-4 rounded" style={{ background: r.color }} />
                <span className="text-sm">{r.label}</span>
              </td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`text-right stat-num px-2 py-1.5 ${leaders[c.key] === i ? 'text-ink font-semibold' : 'text-ink-muted'}`}
                >
                  {r.stats[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
