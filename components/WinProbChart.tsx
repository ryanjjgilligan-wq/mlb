'use client';

import {
  AreaChart,
  Area,
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
}: {
  data: WPPoint[];
  awayName: string;
  homeName: string;
}) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-2xs text-ink-faint">
        Win probability becomes available once the game begins.
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="wpHome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="wpAway" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#f87171" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
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
            stroke="#34d399"
            strokeWidth={1.5}
            fill="url(#wpHome)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
