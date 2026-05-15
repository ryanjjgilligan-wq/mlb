import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getPlayer,
  getPlayerSeasonStats,
  getPlayerCareerStats,
  getPlayerGameLog,
  getPlayerSplits,
  getHittingLeaders,
  getPitchingLeaders,
  playerHeadshotUrl,
  teamCapLogoUrl,
} from '@/lib/mlb';
import { Panel } from '@/components/ui/Panel';
import { Stat } from '@/components/ui/Stat';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { Empty } from '@/components/ui/Empty';
import { PercentileBar } from '@/components/PercentileBar';
import { SeasonPercentileProfile } from '@/components/SeasonPercentileProfile';
import { WatchButton } from '@/components/WatchButton';
import { RollingChart } from '@/components/RollingChart';
import { SplitsTable } from '@/components/SplitsTable';
import { buildRolling, type MetricKey } from '@/lib/rolling';
import { buildHitterCorpus, buildPitcherCorpus, findComparables } from '@/lib/knn';
import {
  obp,
  slg,
  iso,
  babip,
  woba,
  fip,
  whip,
  k9,
  bb9,
  hr9,
  kRate,
  bbRate,
  fmtAvg,
  fmtNum,
  fmtPct,
} from '@/lib/saber';

export const revalidate = 600;

export async function generateMetadata({ params }: { params: { id: string } }) {
  const p = await getPlayer(parseInt(params.id, 10)).catch(() => null);
  return { title: p?.fullName ?? 'Player' };
}

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const player = await getPlayer(id);
  if (!player) notFound();

  const isPitcher = player.primaryPosition.code === '1';
  const group = isPitcher ? 'pitching' : 'hitting';

  const [seasonSplit, careerSplits, gameLog, splits, leaderboard] = await Promise.all([
    getPlayerSeasonStats(id, group as any).catch(() => null),
    getPlayerCareerStats(id, group as any).catch(() => []),
    getPlayerGameLog(id, group as any).catch(() => []),
    getPlayerSplits(id, group as any).catch(() => []),
    isPitcher ? getPitchingLeaders().catch(() => []) : getHittingLeaders().catch(() => []),
  ]);

  // Comparables from the corpus
  const corpus = isPitcher ? buildPitcherCorpus(leaderboard) : buildHitterCorpus(leaderboard);
  const comparables = findComparables(id, corpus, 6);

  const s = (seasonSplit?.stat ?? {}) as Record<string, any>;
  const hasSeasonData = Object.keys(s).length > 0;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Identity */}
      <div className="flex flex-wrap items-center gap-5 panel p-5">
        <img
          src={playerHeadshotUrl(player.id, 213)}
          alt={player.fullName}
          className="w-24 h-24 rounded-full bg-bg-raised object-cover"
        />
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{player.fullName}</h1>
            <Badge variant="accent">{player.primaryPosition.abbreviation}</Badge>
            {player.primaryNumber && <Badge>#{player.primaryNumber}</Badge>}
            <span className="ml-auto">
              <WatchButton
                type="player"
                id={player.id}
                name={player.fullName}
                meta={player.currentTeam?.name}
              />
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            {player.currentTeam && (
              <Link href={`/team/${player.currentTeam.id}`} className="flex items-center gap-1.5 hover:text-ink">
                <img src={teamCapLogoUrl(player.currentTeam.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                {player.currentTeam.name}
              </Link>
            )}
            <span className="text-ink-faint">·</span>
            <span>B/T: {player.batSide?.code}/{player.pitchHand?.code}</span>
            <span className="text-ink-faint">·</span>
            <span>{player.height} {player.weight ? `· ${player.weight} lbs` : ''}</span>
            <span className="text-ink-faint">·</span>
            <span>Age {player.currentAge}</span>
            {player.birthCountry && (
              <>
                <span className="text-ink-faint">·</span>
                <span>{[player.birthCity, player.birthStateProvince, player.birthCountry].filter(Boolean).join(', ')}</span>
              </>
            )}
          </p>
          {player.mlbDebutDate && (
            <p className="text-2xs text-ink-faint mt-0.5">MLB debut: <span className="stat-num">{player.mlbDebutDate}</span></p>
          )}
        </div>
      </div>

      {!hasSeasonData ? (
        <Panel title="Season stats">
          <Empty
            title="No season stats yet."
            description="This player has not accumulated stats for the current season, or has not appeared in MLB games."
          />
        </Panel>
      ) : isPitcher ? (
        <PitcherView season={s} careerSplits={careerSplits} gameLog={gameLog} splits={splits} comparables={comparables} />
      ) : (
        <HitterView season={s} careerSplits={careerSplits} gameLog={gameLog} splits={splits} comparables={comparables} />
      )}

      {careerSplits.length > 1 && (
        <Panel
          title="Year-by-year"
          subtitle="Career line · MLB Stats API"
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                  <th className="text-left font-medium px-3 py-2">Year</th>
                  <th className="text-left font-medium px-2 py-2">Team</th>
                  {isPitcher ? (
                    <>
                      <Th>W</Th><Th>L</Th><Th>ERA</Th><Th>G</Th><Th>GS</Th><Th>IP</Th><Th>SO</Th><Th>BB</Th><Th>WHIP</Th>
                    </>
                  ) : (
                    <>
                      <Th>G</Th><Th>AB</Th><Th>R</Th><Th>H</Th><Th>2B</Th><Th>3B</Th><Th>HR</Th><Th>RBI</Th><Th>SB</Th><Th>BB</Th><Th>SO</Th><Th>AVG</Th><Th>OBP</Th><Th>SLG</Th><Th>OPS</Th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...careerSplits].reverse().map((sp: any, i) => (
                  <tr key={i} className="row-hover border-b border-line-subtle last:border-0">
                    <td className="px-3 py-1.5 stat-num">{sp.season}</td>
                    <td className="px-2 py-1.5 text-ink-muted">{sp.team?.name ?? '—'}</td>
                    {isPitcher ? (
                      <>
                        <Td v={sp.stat.wins} />
                        <Td v={sp.stat.losses} />
                        <Td v={sp.stat.era} />
                        <Td v={sp.stat.gamesPlayed} />
                        <Td v={sp.stat.gamesStarted} />
                        <Td v={sp.stat.inningsPitched} />
                        <Td v={sp.stat.strikeOuts} />
                        <Td v={sp.stat.baseOnBalls} />
                        <Td v={sp.stat.whip} />
                      </>
                    ) : (
                      <>
                        <Td v={sp.stat.gamesPlayed} />
                        <Td v={sp.stat.atBats} />
                        <Td v={sp.stat.runs} />
                        <Td v={sp.stat.hits} />
                        <Td v={sp.stat.doubles} />
                        <Td v={sp.stat.triples} />
                        <Td v={sp.stat.homeRuns} />
                        <Td v={sp.stat.rbi} />
                        <Td v={sp.stat.stolenBases} />
                        <Td v={sp.stat.baseOnBalls} />
                        <Td v={sp.stat.strikeOuts} />
                        <Td v={sp.stat.avg} />
                        <Td v={sp.stat.obp} />
                        <Td v={sp.stat.slg} />
                        <Td v={sp.stat.ops} />
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-right font-medium px-2 py-2">{children}</th>;
}
function Td({ v }: { v: any }) {
  return <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{v ?? '—'}</td>;
}

function HitterView({
  season,
  careerSplits,
  gameLog,
  splits,
  comparables,
}: {
  season: Record<string, any>;
  careerSplits: any[];
  gameLog: any[];
  splits: any[];
  comparables: ReturnType<typeof findComparables>;
}) {
  const computedWoba = woba(season);
  const computedBabip = babip(season);
  const computedIso = iso(season);
  const computedK = kRate(season);
  const computedBb = bbRate(season);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Hero stats */}
      <Panel className="lg:col-span-12" title="Slash line · season-to-date">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-4">
          <Stat label="AVG" value={season.avg ?? '—'} size="xl" />
          <Stat label="OBP" value={season.obp ?? '—'} size="xl" />
          <Stat label="SLG" value={season.slg ?? '—'} size="xl" />
          <Stat label="OPS" value={season.ops ?? '—'} size="xl" />
          <Stat label="HR" value={season.homeRuns ?? '—'} size="xl" />
          <Stat label="RBI" value={season.rbi ?? '—'} size="xl" />
        </div>
      </Panel>

      <Panel
        className="lg:col-span-7"
        title="Plate discipline & batted ball"
        subtitle="Computed from official counting stats · static-weight wOBA (Fangraphs ~2023 weights)"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
          <Stat label="wOBA" value={fmtAvg(computedWoba)} size="md" hint="Weighted On-Base Average. Each event weighted by its run value. League average ~ .310–.330." />
          <Stat label="ISO" value={fmtAvg(computedIso)} size="md" hint="Isolated Power (SLG − AVG). Pure extra-base ability." />
          <Stat label="BABIP" value={fmtAvg(computedBabip)} size="md" hint="Batting Avg on Balls in Play. League ~ .300. Extreme values often regress." />
          <Stat label="K%" value={fmtPct(computedK)} size="md" hint="Strikeouts per plate appearance" />
          <Stat label="BB%" value={fmtPct(computedBb)} size="md" hint="Walks per plate appearance" />
          <Stat label="BB/K" value={season.atBatsPerHomeRun ? fmtNum((season.baseOnBalls || 0) / Math.max(1, season.strikeOuts || 1), 2) : '—'} size="md" />
          <Stat label="GIDP" value={season.groundIntoDoublePlay ?? '—'} size="md" />
          <Stat label="SB / CS" value={`${season.stolenBases ?? '—'} / ${season.caughtStealing ?? '—'}`} size="md" />
        </div>
      </Panel>

      {/* Percentile profile — toggle between current and prior 3 seasons */}
      <Panel
        className="lg:col-span-5"
        title="Profile vs. league"
        subtitle="Anchor-based percentiles · toggle prior seasons or compare two side-by-side"
      >
        <SeasonPercentileProfile
          isPitcher={false}
          seasons={buildSeasonOptions(season, careerSplits, 4)}
        />
      </Panel>

      {/* Rolling performance */}
      <Panel
        className="lg:col-span-12"
        title="Rolling performance"
        subtitle={`Game log · ${gameLog.length} games this season · shaded band is a ±1.96σ Wilson-style interval`}
      >
        {gameLog.length >= 3 ? (
          <RollingHitter gameLog={gameLog} />
        ) : (
          <Empty title="Not enough games" description="Rolling windows need at least three games of data." />
        )}
      </Panel>

      {/* Splits */}
      <Panel className="lg:col-span-7" title="Splits" subtitle="vs handedness · home/away · day/night" flush>
        <SplitsTable splits={splits} isPitching={false} />
      </Panel>

      {/* Comparables */}
      <Panel
        className="lg:col-span-5"
        title="Comparables"
        subtitle="k-NN over season rate-stat z-scores (qualified hitters)"
        flush
      >
        <ComparablesList comparables={comparables} />
      </Panel>
    </div>
  );
}

function PitcherView({
  season,
  careerSplits,
  gameLog,
  splits,
  comparables,
}: {
  season: Record<string, any>;
  careerSplits: any[];
  gameLog: any[];
  splits: any[];
  comparables: ReturnType<typeof findComparables>;
}) {
  const computedFip = fip(season);
  const computedWhip = whip(season);
  const computedK9 = k9(season);
  const computedBb9 = bb9(season);
  const computedHr9 = hr9(season);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Panel className="lg:col-span-12" title="Pitching line · season-to-date">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-4">
          <Stat label="ERA" value={season.era ?? '—'} size="xl" />
          <Stat label="WHIP" value={season.whip ?? '—'} size="xl" />
          <Stat label="W-L" value={`${season.wins ?? '—'}-${season.losses ?? '—'}`} size="xl" />
          <Stat label="IP" value={season.inningsPitched ?? '—'} size="xl" />
          <Stat label="SO" value={season.strikeOuts ?? '—'} size="xl" />
          <Stat label="BB" value={season.baseOnBalls ?? '—'} size="xl" />
        </div>
      </Panel>

      <Panel
        className="lg:col-span-7"
        title="Run prevention & rates"
        subtitle="Static-constant FIP (3.10). Real Fangraphs FIP uses per-season league constants."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
          <Stat label="FIP" value={fmtNum(computedFip, 2)} size="md" hint="Fielding Independent Pitching. Predicts ERA using HR, BB, HBP, K — strips out defense and BABIP luck." />
          <Stat label="K/9" value={fmtNum(computedK9, 2)} size="md" />
          <Stat label="BB/9" value={fmtNum(computedBb9, 2)} size="md" />
          <Stat label="HR/9" value={fmtNum(computedHr9, 2)} size="md" />
          <Stat label="K/BB" value={(season.strikeOuts && season.baseOnBalls) ? fmtNum(season.strikeOuts / season.baseOnBalls, 2) : '—'} size="md" />
          <Stat label="OPP. AVG" value={season.avg ?? '—'} size="md" />
          <Stat label="QS" value={season.qualityStarts ?? '—'} size="md" hint="Quality Starts — 6+ IP, 3 ER or fewer" />
          <Stat label="SV" value={season.saves ?? '—'} size="md" />
        </div>
      </Panel>

      <Panel
        className="lg:col-span-5"
        title="Profile vs. league"
        subtitle="Anchor-based percentiles · toggle prior seasons or compare two side-by-side"
      >
        <SeasonPercentileProfile
          isPitcher={true}
          seasons={buildSeasonOptions(season, careerSplits, 4)}
        />
      </Panel>

      <Panel
        className="lg:col-span-12"
        title="Rolling performance"
        subtitle={`Game log · ${gameLog.length} appearances · shaded band ≈ ±1σ rate uncertainty`}
      >
        {gameLog.length >= 3 ? (
          <RollingPitcher gameLog={gameLog} />
        ) : (
          <Empty title="Not enough appearances" description="Need at least three outings." />
        )}
      </Panel>

      <Panel className="lg:col-span-7" title="Splits" subtitle="vs handedness · home/away · day/night" flush>
        <SplitsTable splits={splits} isPitching={true} />
      </Panel>

      <Panel
        className="lg:col-span-5"
        title="Comparables"
        subtitle="k-NN over season rate-stat z-scores (qualified pitchers)"
        flush
      >
        <ComparablesList comparables={comparables} />
      </Panel>
    </div>
  );
}

function RollingHitter({ gameLog }: { gameLog: any[] }) {
  const sorted = [...gameLog].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const w15Avg = buildRolling(sorted, 'avg', 15);
  const w15Woba = buildRolling(sorted, 'woba', 15);
  const w30Ops = buildRolling(sorted, 'ops', 30);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <div className="label-micro mb-1">15-game rolling AVG</div>
        <RollingChart data={w15Avg} metricLabel="AVG" metricColor="#facc15" />
      </div>
      <div>
        <div className="label-micro mb-1">15-game rolling wOBA</div>
        <RollingChart data={w15Woba} metricLabel="wOBA" metricColor="#34d399" />
      </div>
      <div>
        <div className="label-micro mb-1">30-game rolling OPS</div>
        <RollingChart data={w30Ops} metricLabel="OPS" metricColor="#60a5fa" yDomain={[0, 1.5]} />
      </div>
    </div>
  );
}

function RollingPitcher({ gameLog }: { gameLog: any[] }) {
  const sorted = [...gameLog].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const w5K9 = buildRolling(sorted, 'k9', 5, true);
  const w5Fip = buildRolling(sorted, 'fip', 5, true);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div className="label-micro mb-1">5-start rolling K/9</div>
        <RollingChart data={w5K9} metricLabel="K/9" metricColor="#34d399" format={(v) => v.toFixed(1)} yDomain={[0, 16]} />
      </div>
      <div>
        <div className="label-micro mb-1">5-start rolling FIP</div>
        <RollingChart data={w5Fip} metricLabel="FIP" metricColor="#facc15" format={(v) => v.toFixed(2)} yDomain={[1, 7]} />
      </div>
    </div>
  );
}

function ComparablesList({ comparables }: { comparables: ReturnType<typeof findComparables> }) {
  if (!comparables.length) {
    return (
      <div className="px-3 py-6">
        <Empty title="No comparables available" description="Player not yet qualified for the leaderboard sample." />
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line-subtle">
      {comparables.map((c) => (
        <li key={c.id}>
          <Link href={`/player/${c.id}`} className="flex items-center gap-3 px-3 py-2 row-hover">
            <img src={playerHeadshotUrl(c.id, 60)} alt="" className="w-7 h-7 rounded-full bg-bg-raised object-cover" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{c.name}</div>
              <div className="text-2xs text-ink-faint truncate">{c.teamName} · {c.pos}</div>
            </div>
            <div className="text-right">
              <div className="stat-num text-sm text-ink">{(c.similarity * 100).toFixed(0)}<span className="text-ink-faint">%</span></div>
              <div className="stat-num text-2xs text-ink-faint">d={c.distance.toFixed(2)}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Build the season options array for SeasonPercentileProfile.
 * Index 0 is the current season; subsequent entries are most-recent-first
 * prior seasons drawn from the year-by-year career splits.
 */
function buildSeasonOptions(currentSeasonStat: Record<string, any>, careerSplits: any[], max = 4) {
  const seasonStr = String(new Date().getFullYear());
  const out: { season: string; stat: Record<string, any>; team?: { name?: string } }[] = [
    { season: seasonStr, stat: currentSeasonStat },
  ];
  // Career splits are typically oldest-first; reverse and skip current season
  const prior = [...careerSplits].reverse().filter((sp) => String(sp.season) !== seasonStr);
  for (const sp of prior) {
    if (out.length >= max) break;
    out.push({ season: String(sp.season), stat: sp.stat ?? {}, team: sp.team });
  }
  return out;
}

/**
 * Map a value to a 0–100 percentile using three anchor points [p10, p50, p90].
 * Piecewise linear. Used for an approximate Savant-style profile when we lack
 * the full league cohort distribution.
 */
function pctFromAnchor(v: number, [p10, p50, p90]: number[]): number {
  if (!Number.isFinite(v)) return 50;
  if (v <= p10) return Math.max(0, 10 * (v / p10));
  if (v <= p50) return 10 + ((v - p10) / (p50 - p10)) * 40;
  if (v <= p90) return 50 + ((v - p50) / (p90 - p50)) * 40;
  return Math.min(100, 90 + ((v - p90) / Math.max(p90 * 0.2, 1e-6)) * 10);
}
