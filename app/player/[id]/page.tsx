import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getPlayer,
  getPlayerSeasonStats,
  getPlayerCareerStats,
  playerHeadshotUrl,
  teamCapLogoUrl,
} from '@/lib/mlb';
import { Panel } from '@/components/ui/Panel';
import { Stat } from '@/components/ui/Stat';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { Empty } from '@/components/ui/Empty';
import { PercentileBar } from '@/components/PercentileBar';
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

  const [seasonSplit, careerSplits] = await Promise.all([
    getPlayerSeasonStats(id, group as any).catch(() => null),
    getPlayerCareerStats(id, group as any).catch(() => []),
  ]);

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
          </div>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            {player.currentTeam && (
              <Link href={`/team/${player.currentTeam.id}`} className="flex items-center gap-1.5 hover:text-ink">
                <img src={teamCapLogoUrl(player.currentTeam.id)} alt="" className="w-4 h-4 invert opacity-80" />
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
        <PitcherView season={s} careerSplits={careerSplits} />
      ) : (
        <HitterView season={s} careerSplits={careerSplits} />
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

function HitterView({ season, careerSplits }: { season: Record<string, any>; careerSplits: any[] }) {
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

      {/* Percentile profile — approximate */}
      <Panel
        className="lg:col-span-5"
        title="Profile vs. league"
        subtitle="Rule-of-thumb percentiles · approximate, replace with cohort-normalized values when ingesting full leaderboards"
      >
        <div className="space-y-1">
          <PercentileBar
            label="AVG"
            value={pctFromAnchor(parseFloat(season.avg ?? '0'), [0.200, 0.250, 0.330])}
            raw={season.avg}
            hint="Batting average vs. league anchors: .200 (p10), .250 (p50), .330 (p90)"
          />
          <PercentileBar
            label="OBP"
            value={pctFromAnchor(parseFloat(season.obp ?? '0'), [0.280, 0.320, 0.400])}
            raw={season.obp}
          />
          <PercentileBar
            label="SLG"
            value={pctFromAnchor(parseFloat(season.slg ?? '0'), [0.340, 0.400, 0.530])}
            raw={season.slg}
          />
          <PercentileBar
            label="ISO"
            value={pctFromAnchor(computedIso, [0.110, 0.160, 0.250])}
            raw={fmtAvg(computedIso)}
          />
          <PercentileBar
            label="wOBA"
            value={pctFromAnchor(computedWoba, [0.280, 0.320, 0.390])}
            raw={fmtAvg(computedWoba)}
            hint="Weighted On-Base Average — single most predictive top-line offensive number."
          />
          <PercentileBar
            label="BB%"
            value={pctFromAnchor(computedBb, [0.050, 0.085, 0.140])}
            raw={fmtPct(computedBb)}
          />
          <PercentileBar
            label="K% (lower is better)"
            value={100 - pctFromAnchor(computedK, [0.130, 0.220, 0.320])}
            raw={fmtPct(computedK)}
          />
        </div>
        <p className="text-2xs text-ink-faint mt-3">
          Approximate league anchors. For exact Savant-style percentiles, ingest cohort distributions per season.
        </p>
      </Panel>
    </div>
  );
}

function PitcherView({ season, careerSplits }: { season: Record<string, any>; careerSplits: any[] }) {
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
        subtitle="Rule-of-thumb percentiles · league anchors"
      >
        <div className="space-y-1">
          <PercentileBar
            label="ERA (lower is better)"
            value={100 - pctFromAnchor(parseFloat(season.era ?? '99'), [2.50, 4.00, 5.50])}
            raw={season.era}
          />
          <PercentileBar
            label="WHIP (lower is better)"
            value={100 - pctFromAnchor(computedWhip, [1.00, 1.30, 1.55])}
            raw={fmtNum(computedWhip, 2)}
          />
          <PercentileBar
            label="FIP (lower is better)"
            value={100 - pctFromAnchor(computedFip, [3.00, 4.10, 5.20])}
            raw={fmtNum(computedFip, 2)}
            hint="Fielding-independent ERA estimator"
          />
          <PercentileBar
            label="K/9"
            value={pctFromAnchor(computedK9, [6.5, 9.0, 12.0])}
            raw={fmtNum(computedK9, 1)}
          />
          <PercentileBar
            label="BB/9 (lower is better)"
            value={100 - pctFromAnchor(computedBb9, [1.8, 3.0, 4.5])}
            raw={fmtNum(computedBb9, 1)}
          />
          <PercentileBar
            label="HR/9 (lower is better)"
            value={100 - pctFromAnchor(computedHr9, [0.8, 1.2, 1.8])}
            raw={fmtNum(computedHr9, 2)}
          />
        </div>
      </Panel>
    </div>
  );
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
