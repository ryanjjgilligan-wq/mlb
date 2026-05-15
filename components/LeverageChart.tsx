'use client';

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export type LeveragePoint = {
  idx: number;
  wpa: number; // signed swing from home perspective, in WP points
  abs: number;
  inning: number;
  desc?: string;
};

export function LeverageChart({ data }: { data: LeveragePoint[] }) {
  if (!data.length) {
    return (
      <div className="h-32 flex items-center justify-center text-2xs text-ink-faint">
        No leverage swings to plot yet.
      </div>
    );
  }
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <XAxis dataKey="idx" hide />
          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(0)}`}
            tick={{ fill: '#62626b', fontSize: 10 }}
            axisLine={{ stroke: '#1f1f24' }}
            tickLine={false}
            width={36}
          />
          <ReferenceLine y={0} stroke="#1f1f24" />
          <Tooltip
            cursor={{ fill: '#16161a' }}
            contentStyle={{
              background: '#070708',
              border: '1px solid #2a2a31',
              borderRadius: 4,
              fontSize: 11,
              padding: '6px 8px',
            }}
            formatter={(_v, _n, p: any) => {
              const d = p.payload as LeveragePoint;
              const sign = d.wpa >= 0 ? '+' : '−';
              return [`${sign}${(Math.abs(d.wpa) * 100).toFixed(1)}% WP`, `Inn ${d.inning}`];
            }}
            labelFormatter={(_, payload) => {
              const d = (payload as any)?.[0]?.payload as LeveragePoint | undefined;
              return d?.desc ?? '';
            }}
          />
          <Bar dataKey="wpa" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.wpa >= 0 ? '#34d399' : '#f87171'}
                fillOpacity={Math.min(1, 0.3 + d.abs * 5)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
