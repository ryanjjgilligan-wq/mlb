'use client';

import { useEffect, useState } from 'react';
import {
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

// Team line colors — kalshi-style two-line chart
const HOME_COLOR = '#34d399'; // mint green
const AWAY_COLOR = '#ec4899'; // hot pink/magenta
const BASELINE_COLOR = '#facc15';

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

  // Build chart series — two distinct curves per team. Pre-game is flat at
  // the baseline for both teams. Live curves move opposite each other.
  type Row = {
    idx: number;
    inning: number;
    half?: string;
    homeWP: number;
    awayWP: number;
    homeBaseline?: number;
    awayBaseline?: number;
    desc?: string;
  };
  const awayBaseline = preGameHomeWP != null ? 1 - preGameHomeWP : 0.5;

  const chartData: Row[] = showingPreGameOnly
    ? Array.from({ length: 10 }, (_, i) => ({
        idx: i,
        inning: i,
        homeWP: baseline,
        awayWP: 1 - baseline,
        homeBaseline: baseline,
        awayBaseline,
        desc: 'Pre-game projection',
      }))
    : data.map((d) => ({
        ...d,
        awayWP: 1 - d.homeWP,
        homeBaseline: baseline,
        awayBaseline,
      }));

  const homeWPNow = chartData.length > 0 ? chartData[chartData.length - 1].homeWP : baseline;
  const awayWPNow = 1 - homeWPNow;
  const drift = homeWPNow - baseline;

  // Compute inning ticks for the X axis from the data points
  const inningTicks = (() => {
    if (showingPreGameOnly) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
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

  // Custom dot at the line tail — only for the last data point
  const lastIdx = chartData.length - 1;
  const makeTailDot = (color: string) => {
    const TailDot = (props: any) => {
      if (props.index !== lastIdx) return <g />;
      return (
        <g>
          <circle cx={props.cx} cy={props.cy} r="6" fill={color} fillOpacity="0.18" />
          <circle cx={props.cx} cy={props.cy} r="3.5" fill={color} stroke="var(--bg)" strokeWidth="1.5" />
        </g>
      );
    };
    TailDot.displayName = `TailDot(${color})`;
    return TailDot;
  };

  return (
    <div className="space-y-3">
      {/* Top header — Kalshi-style team chips with color dots + percentages */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: AWAY_COLOR }} />
            <span className="text-2xs uppercase tracking-micro text-ink-muted">{awayName}</span>
            <span className="stat-num text-base font-semibold text-ink">{(awayWPNow * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: HOME_COLOR }} />
            <span className="text-2xs uppercase tracking-micro text-ink-muted">{homeName}</span>
            <span className="stat-num text-base font-semibold text-ink">{(homeWPNow * 100).toFixed(1)}%</span>
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
          <ComposedChart data={chartData} margin={{ top: 12, right: 50, left: 0, bottom: 22 }}>
            {/* 50% center line — break-even */}
            <ReferenceLine y={0.5} stroke="#3a3a42" strokeDasharray="3 4" strokeWidth={1} />

            {/* Y-axis on the right (Kalshi style) */}
            <YAxis
              orientation="right"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fill: '#62626b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />

            {/* X-axis — inning labels at the bottom */}
            <XAxis
              dataKey="idx"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={inningTicks}
              tickFormatter={(v) => {
                const tickIdx = inningTicks.indexOf(Number(v));
                return tickIdx >= 0 ? ordinal(tickIdx + 1) : '';
              }}
              tick={{ fill: '#62626b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              padding={{ left: 8, right: 16 }}
            />

            {/* Vertical inning grid lines */}
            {inningTicks.map((tick) => (
              <ReferenceLine
                key={tick}
                x={tick}
                stroke="#1f1f24"
                strokeDasharray="2 4"
                strokeOpacity={0.7}
              />
            ))}

            {/* Pre-game baseline reference (faint dashed for context) */}
            {preGameHomeWP != null && !showingPreGameOnly && (
              <>
                <ReferenceLine
                  y={preGameHomeWP}
                  stroke={HOME_COLOR}
                  strokeDasharray="3 5"
                  strokeOpacity={0.35}
                />
                <ReferenceLine
                  y={1 - preGameHomeWP}
                  stroke={AWAY_COLOR}
                  strokeDasharray="3 5"
                  strokeOpacity={0.35}
                />
              </>
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
              labelFormatter={() => ''}
              formatter={(value: number, name: string, props) => {
                const p = props.payload as Row;
                const team = name === 'homeWP' ? homeName : awayName;
                return [`${team}: ${(value * 100).toFixed(1)}%`, p.desc ?? ''];
              }}
            />

            {/* Pre-game flat baselines — only when no live data */}
            {showingPreGameOnly && (
              <>
                <Line
                  type="monotone"
                  dataKey="homeWP"
                  stroke={HOME_COLOR}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="awayWP"
                  stroke={AWAY_COLOR}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </>
            )}

            {/* Live curves — solid lines, dot marker at the tail */}
            {!showingPreGameOnly && (
              <>
                <Line
                  type="monotone"
                  dataKey="homeWP"
                  stroke={HOME_COLOR}
                  strokeWidth={2}
                  dot={makeTailDot(HOME_COLOR)}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="awayWP"
                  stroke={AWAY_COLOR}
                  strokeWidth={2}
                  dot={makeTailDot(AWAY_COLOR)}
                  isAnimationActive={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Compact footer legend */}
      <div className="flex items-center justify-between gap-3 text-2xs text-ink-faint">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5" style={{ background: HOME_COLOR }} /> {homeName} {showingPreGameOnly ? 'pre-game' : 'live'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5" style={{ background: AWAY_COLOR }} /> {awayName} {showingPreGameOnly ? 'pre-game' : 'live'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-px bg-ink-faint" /> 50% break-even
          </span>
          {!showingPreGameOnly && preGameHomeWP != null && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px border-t border-dashed border-ink-faint" /> pre-game baselines
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
