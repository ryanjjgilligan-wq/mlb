'use client';

import { useState } from 'react';
import Link from 'next/link';
import { teamCapLogoUrl } from '@/lib/mlb';

export type TeamStatsCompareData = {
  away: { id: number; abbr: string; name: string; teamStats?: any };
  home: { id: number; abbr: string; name: string; teamStats?: any };
};

type Tab = 'hitting' | 'pitching';

const HITTING_ROWS: Array<{ key: string; label: string; max?: number }> = [
  { key: 'hits', label: 'Hits' },
  { key: 'homeRuns', label: 'Home Runs' },
  { key: 'totalBases', label: 'Total Bases' },
  { key: 'leftOnBase', label: 'Runners LOB' },
  { key: 'baseOnBalls', label: 'Walks' },
  { key: 'strikeOuts', label: 'Strikeouts', max: 20 },
];

const PITCHING_ROWS: Array<{ key: string; label: string; lowerIsBetter?: boolean }> = [
  { key: 'strikeOuts', label: 'Strikeouts' },
  { key: 'baseOnBalls', label: 'Walks Issued', lowerIsBetter: true },
  { key: 'hits', label: 'Hits Allowed', lowerIsBetter: true },
  { key: 'earnedRuns', label: 'Earned Runs', lowerIsBetter: true },
  { key: 'homeRuns', label: 'HR Allowed', lowerIsBetter: true },
  { key: 'pitchesThrown', label: 'Pitches' },
];

/**
 * Tabbed Hitting / Pitching stats comparison between the two teams in a
 * game, mirrored side-by-side with bar charts that scale to the larger
 * value across both clubs.
 */
export function TeamStatsCompare({ data }: { data: TeamStatsCompareData }) {
  const [tab, setTab] = useState<Tab>('hitting');
  const awayBlock = tab === 'hitting'
    ? data.away.teamStats?.batting
    : data.away.teamStats?.pitching;
  const homeBlock = tab === 'hitting'
    ? data.home.teamStats?.batting
    : data.home.teamStats?.pitching;

  const rows = tab === 'hitting' ? HITTING_ROWS : PITCHING_ROWS;

  return (
    <div>
      {/* Tab strip */}
      <div className="flex border-b border-line">
        {(['hitting', 'pitching'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium uppercase tracking-micro transition-colors relative ${
              tab === t ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t} Stats
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Team headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 px-4 py-3 border-b border-line">
        <Link href={`/team/${data.away.id}`} className="flex items-center gap-2 hover:text-accent">
          <img src={teamCapLogoUrl(data.away.id)} alt="" className="w-6 h-6 team-logo opacity-95" />
          <span className="text-sm font-semibold text-ink">{data.away.abbr}</span>
        </Link>
        <span className="text-2xs text-ink-faint stat-num self-center">vs</span>
        <Link href={`/team/${data.home.id}`} className="flex items-center justify-end gap-2 hover:text-accent text-right">
          <span className="text-sm font-semibold text-ink">{data.home.abbr}</span>
          <img src={teamCapLogoUrl(data.home.id)} alt="" className="w-6 h-6 team-logo opacity-95" />
        </Link>
      </div>

      {/* Rows */}
      <ul>
        {rows.map((row) => {
          const awayRaw = Number(awayBlock?.[row.key] ?? 0);
          const homeRaw = Number(homeBlock?.[row.key] ?? 0);
          const max = Math.max(awayRaw, homeRaw, 1);
          // For "lower is better" pitching stats, the leader is whoever has the smaller value
          const lowerIsBetter = (row as any).lowerIsBetter;
          const awayLeads = lowerIsBetter ? awayRaw < homeRaw : awayRaw > homeRaw;
          const homeLeads = lowerIsBetter ? homeRaw < awayRaw : homeRaw > awayRaw;
          return (
            <li key={row.key} className="grid grid-cols-[1fr_auto_1fr] gap-4 px-4 py-3 border-b border-line-subtle last:border-0">
              {/* Away side — bar grows leftward */}
              <div className="flex items-center gap-3">
                <span className={`stat-num text-lg font-semibold w-8 ${awayLeads ? 'text-ink' : 'text-ink-muted'}`}>{awayRaw}</span>
                <div className="flex-1 h-2.5 bg-bg-sunken rounded overflow-hidden flex justify-end">
                  <div
                    className={`h-full ${awayLeads ? 'bg-signal-pos' : 'bg-ink-muted/40'}`}
                    style={{ width: `${(awayRaw / max) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-2xs text-ink-muted text-center self-center px-2 whitespace-nowrap">{row.label}</div>
              {/* Home side — bar grows rightward */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 bg-bg-sunken rounded overflow-hidden">
                  <div
                    className={`h-full ${homeLeads ? 'bg-signal-pos' : 'bg-ink-muted/40'}`}
                    style={{ width: `${(homeRaw / max) * 100}%` }}
                  />
                </div>
                <span className={`stat-num text-lg font-semibold w-8 text-right ${homeLeads ? 'text-ink' : 'text-ink-muted'}`}>{homeRaw}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
