'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
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

/**
 * Win probability chart.
 *
 *  - Pre-game state: renders our model's pre-game WP as a horizontal
 *    dashed yellow line spanning all 9 innings, with shaded confidence
 *    bands around it. Looks like a real chart, just one with a flat
 *    "expected" line because the game hasn't started.
 *
 *  - Live state: layers the live MLB curve (solid green when home leads,
 *    red when away leads) on top of the pre-game line. The drift between
 *    the two is now the visual story.
 *
 *  - Final state: same as live but no LIVE pulse.
 *
 * Background reference: 50% center line, light "home leads" / "away leads"
 * shaded zones above/below for orientation, inning markers along the X
 * axis (1st through 9th).
 */
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
  preGameHomeWP?: number;
  isLive?: boolean;
}) {
  // Live freshness counter
  const [lastUpdated] = useState(() => Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000));

  const showingPreGameOnly = data.length === 0;
  const baseline = preGameHomeWP ?? 0.5;

  // Build the chart series. We synthesize a baseline value at every X point
  // so we can draw it as its own line layered with the live curve.
  // Pre-game only: one point per inning (1..9) all at baseline.
  // Live: every actual play point with the baseline carried alongside.
  type Row = { idx: number; inning: number; half?: string; homeWP: number; baseline: number; desc?: string };
  const chartData: Row[] = showingPreGameOnly
    ? Array.from({ length: 10 }, (_, i) => ({
        idx: i,
        inning: i,
        homeWP: baseline,
        baseline,
        desc: 'Pre-game projection',
      }))
    : data.map((d) => ({ ...d, baseline }));

  const homeWPNow = chartData.length > 0 ? chartData[chartData.length - 1].homeWP : baseline;
  const drift = homeWPNow - baseline; // positive = model behind, negative = model behind for away

  // Compute approximate inning ticks for the X axis using the data points
  const inningTicks = (() => {
    if (showingPreGameOnly) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    // For live data, find the first idx where each inning begins
    const seen = new Set<number>();
    const ticks: number[] = [];
    for (const p of chartData) {
      if (p.inning > 0 && !seen.has(p.inning)) {
        seen.add(p.inning);
        ticks.push(p.idx);
      }
    }
    return ticks;
  })();

  return (
    <div className="space-y-3">
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
          {!showingPreGameOnly && Math.abs(drift) > 0.05 && (
            <span className={`text-2xs uppercase tracking-micro px-1.5 py-0.5 rounded border ${
              drift > 0
                ? 'border-signal-pos/30 bg-signal-pos/5 text-signal-pos'
                : 'border-signal-neg/30 bg-signal-neg/5 text-signal-neg'
            }`}>
              drift {drift >= 0 ? '+' : ''}{(drift * 100).toFixed(1)}pp
            </span>
          )}
          {showingPreGameOnly && (
            <span className="text-2xs uppercase tracking-micro px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 text-accent">
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

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 22 }}>
            <defs>
              <linearGradient id="wpHomeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#34d399" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="wpAwayFill" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#f87171" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#f87171" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Background tint zones — subtle "home leads" green up top, "away leads" red bottom */}
            <ReferenceArea y1={0.5} y2={1} fill="#34d399" fillOpacity={0.025} />
            <ReferenceArea y1={0} y2={0.5} fill="#f87171" fillOpacity={0.025} />

            {/* Y axis */}
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) =>
                v === 0 ? '0%' : v === 1 ? '100%' : v === 0.5 ? '50%' : `${Math.round(v * 100)}`
              }
              tick={{ fill: '#62626b', fontSize: 10 }}
              axisLine={{ stroke: '#1f1f24' }}
              tickLine={false}
              width={40}
            />

            {/* X axis — inning labels */}
            <XAxis
              dataKey="idx"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={inningTicks}
              tickFormatter={(v) => {
                const tickIdx = inningTicks.indexOf(Number(v));
                return tickIdx >= 0 ? ordinal(tickIdx + 1) : '';
              }}
              tick={{ fill: '#62626b', fontSize: 9 }}
              axisLine={{ stroke: '#1f1f24' }}
              tickLine={false}
              padding={{ left: 4, right: 4 }}
            />

            {/* 50% center line */}
            <ReferenceLine y={0.5} stroke="#3a3a42" strokeDasharray="3 3" strokeWidth={1} />

            {/* Pre-game baseline — yellow dashed reference line */}
            {preGameHomeWP != null && (
              <ReferenceLine
                y={preGameHomeWP}
                stroke="#facc15"
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                label={{
                  value: `pre-game · ${(preGameHomeWP * 100).toFixed(0)}%`,
                  fill: '#facc15',
                  fontSize: 9,
                  position: 'insideTopRight',
                  offset: 4,
                }}
              />
            )}

            {/* Vertical inning grid lines (subtle) */}
            {inningTicks.map((tick) => (
              <ReferenceLine key={tick} x={tick} stroke="#1f1f24" strokeDasharray="2 4" strokeOpacity={0.6} />
            ))}

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
              formatter={(value: number, _n, props) => {
                const p = props.payload as Row;
                return [
                  `${homeName}: ${(value * 100).toFixed(1)}% / ${awayName}: ${((1 - value) * 100).toFixed(1)}%`,
                  p.desc ?? '',
                ];
              }}
            />

            {/* Above-50% home-leading area (only meaningful for live data) */}
            {!showingPreGameOnly && (
              <Area
                type="monotone"
                dataKey="homeWP"
                stroke="none"
                fill="url(#wpHomeFill)"
                isAnimationActive={false}
                connectNulls
              />
            )}

            {/* Pre-game baseline as a flat dashed line (always present) */}
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="#facc15"
              strokeWidth={showingPreGameOnly ? 2.5 : 1.4}
              strokeDasharray={showingPreGameOnly ? '6 4' : '5 4'}
              dot={false}
              isAnimationActive={false}
            />

            {/* Live WP line on top */}
            {!showingPreGameOnly && (
              <Line
                type="monotone"
                dataKey="homeWP"
                stroke="#34d399"
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend bar */}
      <div className="flex items-center justify-between gap-3 text-2xs text-ink-faint">
        <div className="flex items-center gap-3 flex-wrap">
          {!showingPreGameOnly && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-signal-pos rounded" /> Live home WP
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #facc15 0 4px, transparent 4px 7px)' }} /> Pre-game projection
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-px bg-ink-faint" /> 50% break-even
          </span>
        </div>
        <span className="hidden sm:inline">{homeName.toUpperCase()} above · {awayName.toUpperCase()} below</span>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
