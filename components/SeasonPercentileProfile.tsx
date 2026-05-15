'use client';

import { useState } from 'react';
import { PercentileBar } from './PercentileBar';
import { Tooltip } from './ui/Tooltip';
import {
  woba,
  obp as obpFn,
  slg as slgFn,
  iso as isoFn,
  fip as fipFn,
  whip as whipFn,
  k9 as k9Fn,
  bb9 as bb9Fn,
  hr9 as hr9Fn,
  kRate,
  bbRate,
  fmtAvg,
  fmtNum,
  fmtPct,
  parseInnings,
} from '@/lib/saber';

export type SeasonOption = {
  season: string;
  stat: Record<string, any>;
  team?: { name?: string };
};

type Mode = 'absolute' | 'delta';

export function SeasonPercentileProfile({
  seasons,
  isPitcher,
}: {
  seasons: SeasonOption[]; // ordered most recent first; index 0 = current season
  isPitcher: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [compareIdx, setCompareIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('absolute');

  if (!seasons.length) {
    return <div className="text-2xs text-ink-faint py-4 text-center">No season data.</div>;
  }

  const selected = seasons[selectedIdx];
  const compare = compareIdx !== null ? seasons[compareIdx] : null;

  const metrics = isPitcher ? buildPitcherMetrics(selected.stat) : buildHitterMetrics(selected.stat);
  const metricsCompare = compare
    ? (isPitcher ? buildPitcherMetrics(compare.stat) : buildHitterMetrics(compare.stat))
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="label-micro">Season</span>
          {seasons.map((s, i) => (
            <button
              key={s.season + i}
              onClick={() => {
                if (selectedIdx === i) return;
                setSelectedIdx(i);
                if (compareIdx === i) setCompareIdx(null);
              }}
              className={`px-1.5 py-0.5 rounded text-2xs stat-num transition-colors ${
                selectedIdx === i
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-ink-muted hover:text-ink hover:bg-bg-hover border border-transparent'
              }`}
            >
              {s.season}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="label-micro">Compare</span>
          <button
            onClick={() => setCompareIdx(null)}
            className={`px-1.5 py-0.5 rounded text-2xs stat-num transition-colors ${
              compareIdx === null
                ? 'bg-bg-hover text-ink border border-line'
                : 'text-ink-muted hover:text-ink border border-transparent'
            }`}
          >
            none
          </button>
          {seasons.map((s, i) =>
            i === selectedIdx ? null : (
              <button
                key={s.season + i + 'cmp'}
                onClick={() => setCompareIdx(i)}
                className={`px-1.5 py-0.5 rounded text-2xs stat-num transition-colors ${
                  compareIdx === i
                    ? 'bg-signal-info/10 text-signal-info border border-signal-info/30'
                    : 'text-ink-muted hover:text-ink hover:bg-bg-hover border border-transparent'
                }`}
              >
                {s.season}
              </button>
            )
          )}
        </div>
      </div>

      {compare && (
        <div className="text-2xs text-ink-faint">
          Comparing <span className="text-accent">{selected.season}</span> against{' '}
          <span className="text-signal-info">{compare.season}</span>{' '}
          <span className="text-ink-faint">
            ({selected.team?.name ?? '—'} vs {compare.team?.name ?? '—'})
          </span>
        </div>
      )}

      <div className="space-y-1">
        {metrics.map((m, i) => {
          const c = metricsCompare?.[i];
          return (
            <div key={m.label}>
              <PercentileBar
                label={m.label}
                value={m.percentile}
                raw={m.display}
                hint={m.hint}
              />
              {c && (
                <div className="grid grid-cols-[140px_1fr_56px] items-center gap-3 -mt-1 mb-1">
                  <span className="text-2xs text-signal-info pl-2">└ {compare?.season}</span>
                  <div className="relative h-1.5">
                    <div className="absolute inset-0 rounded-full bg-line/40" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-bg shadow-sm"
                      style={{ left: `calc(${Math.max(0, Math.min(100, c.percentile))}% - 4px)`, background: 'var(--ink-muted)' }}
                    />
                  </div>
                  <div className="text-right">
                    <div className="stat-num text-2xs text-signal-info">
                      {c.display}{' '}
                      <span className="text-ink-faint">
                        Δ{(m.percentile - c.percentile >= 0 ? '+' : '')}
                        {(m.percentile - c.percentile).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-2xs text-ink-faint">
        Anchor-based percentiles, applied to each season independently. Real Savant percentiles
        use that season's qualified-player cohort — see <a className="underline" href="/lab">/lab</a>.
      </p>
    </div>
  );
}

type Metric = { label: string; percentile: number; display: string; hint?: string };

function buildHitterMetrics(s: Record<string, any>): Metric[] {
  const woba_ = woba(s);
  const iso_ = isoFn(s);
  const k_ = kRate(s);
  const bb_ = bbRate(s);
  return [
    { label: 'AVG', display: s.avg ?? '—', percentile: pct(parseFloat(s.avg ?? '0'), [0.200, 0.250, 0.330]) },
    { label: 'OBP', display: s.obp ?? '—', percentile: pct(parseFloat(s.obp ?? '0'), [0.280, 0.320, 0.400]) },
    { label: 'SLG', display: s.slg ?? '—', percentile: pct(parseFloat(s.slg ?? '0'), [0.340, 0.400, 0.530]) },
    { label: 'ISO', display: fmtAvg(iso_), percentile: pct(iso_, [0.110, 0.160, 0.250]) },
    { label: 'wOBA', display: fmtAvg(woba_), percentile: pct(woba_, [0.280, 0.320, 0.390]) },
    { label: 'BB%', display: fmtPct(bb_), percentile: pct(bb_, [0.050, 0.085, 0.140]) },
    { label: 'K% (lower better)', display: fmtPct(k_), percentile: 100 - pct(k_, [0.130, 0.220, 0.320]) },
  ];
}

function buildPitcherMetrics(s: Record<string, any>): Metric[] {
  const fip_ = fipFn(s);
  const whip_ = whipFn(s);
  const k9_ = k9Fn(s);
  const bb9_ = bb9Fn(s);
  const hr9_ = hr9Fn(s);
  return [
    { label: 'ERA (lower better)', display: s.era ?? '—', percentile: 100 - pct(parseFloat(s.era ?? '99'), [2.50, 4.00, 5.50]) },
    { label: 'WHIP (lower better)', display: fmtNum(whip_, 2), percentile: 100 - pct(whip_, [1.00, 1.30, 1.55]) },
    { label: 'FIP (lower better)', display: fmtNum(fip_, 2), percentile: 100 - pct(fip_, [3.00, 4.10, 5.20]) },
    { label: 'K/9', display: fmtNum(k9_, 1), percentile: pct(k9_, [6.5, 9.0, 12.0]) },
    { label: 'BB/9 (lower better)', display: fmtNum(bb9_, 1), percentile: 100 - pct(bb9_, [1.8, 3.0, 4.5]) },
    { label: 'HR/9 (lower better)', display: fmtNum(hr9_, 2), percentile: 100 - pct(hr9_, [0.8, 1.2, 1.8]) },
  ];
}

function pct(v: number, [p10, p50, p90]: number[]): number {
  if (!Number.isFinite(v)) return 50;
  if (v <= p10) return Math.max(0, 10 * (v / p10));
  if (v <= p50) return 10 + ((v - p10) / (p50 - p10)) * 40;
  if (v <= p90) return 50 + ((v - p50) / (p90 - p50)) * 40;
  return Math.min(100, 90 + ((v - p90) / Math.max(p90 * 0.2, 1e-6)) * 10);
}
