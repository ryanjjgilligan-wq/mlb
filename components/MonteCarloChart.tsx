'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export type MCDist = { wins: number; freq: number };

export function MonteCarloChart({
  distribution,
  expectedWins,
  height = 180,
}: {
  distribution: MCDist[];
  expectedWins: number;
  height?: number;
}) {
  if (!distribution.length) {
    return (
      <div className="h-32 flex items-center justify-center text-2xs text-ink-faint">
        No simulation results.
      </div>
    );
  }

  // Color above/below 0.500 threshold of typical playoff cut (~88)
  const data = distribution.map((d) => ({
    ...d,
    pctOf: (d.freq * 100).toFixed(1),
  }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <XAxis
            dataKey="wins"
            tick={{ fill: '#62626b', fontSize: 10 }}
            axisLine={{ stroke: '#1f1f24' }}
            tickLine={false}
          />
          <YAxis hide />
          <ReferenceLine
            x={Math.round(expectedWins)}
            stroke="#facc15"
            strokeDasharray="3 3"
            label={{
              value: `μ=${expectedWins.toFixed(1)}`,
              fill: '#facc15',
              fontSize: 10,
              position: 'top',
            }}
          />
          <Tooltip
            cursor={{ fill: '#16161a' }}
            contentStyle={{
              background: '#070708',
              border: '1px solid #2a2a31',
              borderRadius: 4,
              fontSize: 11,
              padding: '6px 8px',
            }}
            formatter={(value: any) => [`${(value * 100).toFixed(1)}%`, 'probability']}
            labelFormatter={(w) => `${w} wins`}
          />
          <Bar dataKey="freq" fill="#34d399" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
