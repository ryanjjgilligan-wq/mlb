'use client';

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export type RollingPoint = {
  game: number;
  date: string;
  metric: number;
  upper: number;
  lower: number;
  rawValue?: number;
};

export function RollingChart({
  data,
  metricLabel,
  metricColor = '#facc15',
  leagueAvg,
  yDomain,
  height = 220,
  format = (v) => v.toFixed(3),
}: {
  data: RollingPoint[];
  metricLabel: string;
  metricColor?: string;
  leagueAvg?: number;
  yDomain?: [number, number];
  height?: number;
  format?: (v: number) => string;
}) {
  if (data.length < 3) {
    return (
      <div className="h-32 flex items-center justify-center text-2xs text-ink-faint">
        Need more games to compute a meaningful rolling window.
      </div>
    );
  }

  // Compute auto domain with padding when not supplied
  const allValues = data.flatMap((d) => [d.lower, d.upper]).filter(Number.isFinite);
  const min = yDomain?.[0] ?? Math.max(0, Math.min(...allValues) - 0.05);
  const max = yDomain?.[1] ?? Math.max(...allValues) + 0.05;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="rollBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metricColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={metricColor} stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="game"
            tick={{ fill: '#62626b', fontSize: 10 }}
            axisLine={{ stroke: '#1f1f24' }}
            tickLine={false}
          />
          <YAxis
            domain={[min, max]}
            tickFormatter={(v) => format(v)}
            tick={{ fill: '#62626b', fontSize: 10 }}
            axisLine={{ stroke: '#1f1f24' }}
            tickLine={false}
            width={44}
          />
          {leagueAvg !== undefined && (
            <ReferenceLine y={leagueAvg} stroke="#3a3a42" strokeDasharray="3 3" label={{ value: 'lg avg', fill: '#62626b', fontSize: 9, position: 'right' }} />
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
            formatter={(value: number, name: string) => {
              if (name === 'upper' || name === 'lower') return null as any;
              return [format(value), metricLabel];
            }}
            labelFormatter={(_, payload) => {
              const p = (payload as any)?.[0]?.payload as RollingPoint | undefined;
              return p ? `Game ${p.game} · ${p.date}` : '';
            }}
          />
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="url(#rollBand)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#0a0a0b"
            fillOpacity={1}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="metric"
            stroke={metricColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
