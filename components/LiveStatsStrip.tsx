/**
 * Compact 4-tile strip with the most important "right now" numbers for a
 * live game: live model total (vs pre-game), live home WP, F5 status,
 * NRFI/YRFI status. Drops at the top of the live cockpit so users don't
 * have to scroll for the headline numbers.
 */

import { Badge } from './ui/Badge';

export type LiveStatsStripData = {
  liveTotal: number;
  preGameTotal: number;
  homeWPLive?: number;
  homeWPPreGame: number;
  homeAbbr: string;
  awayAbbr: string;
  f5Result: 'pending' | 'live' | 'over' | 'under' | 'push';
  f5Runs: number;
  f5Line: number;
  f5Complete: boolean;
  nrfiResult: 'pending' | 'live' | 'hit' | 'miss';
  nrfiPreGame: number; // model's pre-game P(NRFI)
};

export function LiveStatsStrip({ d }: { d: LiveStatsStripData }) {
  const totalDrift = d.liveTotal - d.preGameTotal;
  const homeWP = d.homeWPLive ?? d.homeWPPreGame;
  const homeLeading = homeWP >= 0.5;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line panel overflow-hidden">
      {/* Live total projection */}
      <Tile
        label="Live total"
        value={d.liveTotal.toFixed(1)}
        sub={`pre-game ${d.preGameTotal.toFixed(1)}`}
        subTrend={Math.abs(totalDrift) > 0.4 ? (totalDrift > 0 ? 'pos' : 'neg') : 'neutral'}
        subValue={totalDrift > 0 ? `+${totalDrift.toFixed(1)}` : totalDrift.toFixed(1)}
      />

      {/* Live WP */}
      <Tile
        label="Live win prob"
        value={`${(homeWP * 100).toFixed(0)}%`}
        valueAccent={homeLeading ? 'pos' : 'neg'}
        sub={`${homeLeading ? d.homeAbbr : d.awayAbbr} leading`}
      />

      {/* F5 status */}
      <Tile
        label={`F5 over ${d.f5Line.toFixed(1)}`}
        value={`${d.f5Runs} R`}
        valueAccent={d.f5Result === 'over' ? 'pos' : d.f5Result === 'under' ? 'pos' : d.f5Result === 'live' ? 'warn' : 'neutral'}
        sub={(() => {
          if (d.f5Result === 'over') return '✓ over hit';
          if (d.f5Result === 'under') return '✓ under hit';
          if (d.f5Result === 'push') return 'push';
          if (d.f5Result === 'live') return d.f5Complete ? 'F5 complete' : 'in progress';
          return 'pending';
        })()}
      />

      {/* NRFI status */}
      <Tile
        label="NRFI"
        value={d.nrfiResult === 'pending'
          ? `${(d.nrfiPreGame * 100).toFixed(0)}%`
          : d.nrfiResult === 'live'
          ? 'live'
          : d.nrfiResult === 'hit'
          ? '✓'
          : '✗'}
        valueAccent={
          d.nrfiResult === 'hit' ? 'pos' :
          d.nrfiResult === 'miss' ? 'neg' :
          d.nrfiResult === 'live' ? 'warn' : 'neutral'
        }
        sub={
          d.nrfiResult === 'hit' ? 'no run in 1st' :
          d.nrfiResult === 'miss' ? 'run scored in 1st' :
          d.nrfiResult === 'live' ? '1st inning live' :
          `pre-game P(NRFI)`
        }
      />
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  subValue,
  subTrend,
  valueAccent,
}: {
  label: string;
  value: string;
  sub?: string;
  subValue?: string;
  subTrend?: 'pos' | 'neg' | 'neutral';
  valueAccent?: 'pos' | 'neg' | 'warn' | 'neutral';
}) {
  const valueCls =
    valueAccent === 'pos' ? 'text-signal-pos' :
    valueAccent === 'neg' ? 'text-signal-neg' :
    valueAccent === 'warn' ? 'text-signal-warn' :
    'text-ink';
  const subCls =
    subTrend === 'pos' ? 'text-signal-pos' :
    subTrend === 'neg' ? 'text-signal-neg' :
    'text-ink-faint';
  return (
    <div className="bg-bg-panel p-4">
      <div className="label-micro mb-1">{label}</div>
      <div className={`stat-num text-2xl font-bold leading-none ${valueCls}`}>{value}</div>
      {(sub || subValue) && (
        <div className="mt-1.5 text-2xs text-ink-muted flex items-center gap-2">
          {subValue && <span className={`stat-num font-semibold ${subCls}`}>{subValue}</span>}
          {sub && <span className="truncate">{sub}</span>}
        </div>
      )}
    </div>
  );
}
