'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type WPPoint = {
  idx: number;
  inning: number;
  half: 'top' | 'bot';
  homeWP: number; // 0–1
  desc?: string;
};

export function WinProbChart({
  data,
  awayName,
  homeName,
  preGameHomeWP,
  isLive,
}: {
  data: WPPoint[];
  awayName: string;
  homeName: string;
  /** Our model's pre-game home win probability (0–1). Used as a baseline. */
  preGameHomeWP?: number;
  isLive?: boolean;
}) {
  // Show "last updated" tick — re-renders on each props change so this
  // becomes a live freshness indicator since the parent page auto-refreshes
  // every 5s and feeds new data props.
  const [lastUpdated] = useState(() => Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000));

  // Build chart data — always include at least the pre-game projection point.
  // When live data exists, append it after the baseline so the line tracks
  // from "this is what we projected" → "this is how it's actually unfolding."
  const chartData: Array<WPPoint & { baseline?: number }> =
    data.length === 0 && preGameHomeWP != null
      ? [
          { idx: 0, inning: 0, half: 'top', homeWP: preGameHomeWP, desc: 'Pre-game projection' },
          { idx: 1, inning: 0, half: 'top', homeWP: preGameHomeWP, desc: 'Pre-game projection' },
        ]
      : data.map((d) => ({ ...d, baseline: preGameHomeWP }));

  const showingPreGameOnly = data.length === 0;
  const homeWPNow =
    chartData.length > 0 ? chartData[chartData.length - 1].homeWP : preGameHomeWP ?? 0.5;

  return (
    <div className="space-y-2">
      {/* Header strip: current WP big numbers + live freshness */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="label-micro">{awayName}</div>
            <div className={`stat-num text-xl font-semibold ${homeWPNow < 0.5 ? 'text-signal-pos' : 'text-ink-muted'}`}>
              {((1 - homeWPNow) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="text-ink-faint text-2xs">vs</div>
          <div>
            <div className="label-micro">{homeName}</div>
            <div className={`stat-num text-xl font-semibold ${homeWPNow >= 0.5 ? 'text-signal-pos' : 'text-ink-muted'}`}>
              {(homeWPNow * 100).toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showingPreGameOnly && (
            <span className="text-2xs uppercase tracking-micro px-1.5 py-0.5 rounded border border-signal-info/30 bg-signal-info/5 text-signal-info">
              pre-game projection
            </span>
          )}
          {isLive && (
            <span className="inline-flex items-center gap-1.5 text-2xs">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-signal-pos" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal-pos" />
              </span>
              <span className="text-signal-pos uppercase tracking-micro">live</span>
              <span className="text-ink-faint stat-num">· {secondsAgo}s ago</span>
            </span>
          )}
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="wpHome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis dataKey="idx" hide />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fill: '#62626b', fontSize: 10 }}
              axisLine={{ stroke: '#1f1f24' }}
              tickLine={false}
              width={36}
            />
            <ReferenceLine y={0.5} stroke="#1f1f24" strokeDasharray="2 3" />
            {/* Pre-game projection baseline as a horizontal dashed line on live charts */}
            {!showingPreGameOnly && preGameHomeWP != null && (
              <ReferenceLine
                y={preGameHomeWP}
                stroke="#facc15"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{
                  value: `pre-game ${(preGameHomeWP * 100).toFixed(0)}%`,
                  fill: '#a3850f',
                  fontSize: 9,
                  position: 'insideTopRight',
                }}
              />
            )}
            <Tooltip
              cursor={{ stroke: '#2a2a31' }}
              contentStyle={{
                background: '#070708',
                border: '1px solid #2a2a31',
                borderRadius: 4,
                fontSize: 11,
                padding: '6px 8px',
              }}
              labelStyle={{ display: 'none' }}
              formatter={(value: number, _name, props) => {
                const p = props.payload as WPPoint;
                return [`${homeName}: ${(value * 100).toFixed(1)}% / ${awayName}: ${((1 - value) * 100).toFixed(1)}%`, p.desc ?? ''];
              }}
            />
            <Area
              type="monotone"
              dataKey="homeWP"
              stroke={showingPreGameOnly ? '#9a9aa3' : '#34d399'}
              strokeWidth={1.8}
              strokeDasharray={showingPreGameOnly ? '6 4' : undefined}
              fill="url(#wpHome)"
              fillOpacity={showingPreGameOnly ? 0.15 : 1}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
