'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { CalibrationBucket } from '@/lib/picks';

export function CalibrationChart({ buckets }: { buckets: CalibrationBucket[] }) {
  const populated = buckets.filter((b) => b.n > 0);
  if (populated.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-2xs text-ink-faint">
        Not enough graded picks with probability annotations yet.
      </div>
    );
  }
  const data = populated.map((b) => ({
    x: b.predicted * 100,
    y: b.actual * 100,
    n: b.n,
    bucket: b.bucket,
  }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 0 }}>
          <CartesianGrid stroke="#1f1f24" strokeDasharray="2 2" />
          <XAxis
            type="number"
            dataKey="x"
            name="Predicted %"
            domain={[40, 100]}
            tick={{ fill: '#62626b', fontSize: 10 }}
            axisLine={{ stroke: '#1f1f24' }}
            tickLine={false}
            label={{ value: 'Predicted probability (%)', fill: '#62626b', fontSize: 10, position: 'insideBottom', offset: -10 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Actual %"
            domain={[0, 100]}
            tick={{ fill: '#62626b', fontSize: 10 }}
            axisLine={{ stroke: '#1f1f24' }}
            tickLine={false}
            label={{ value: 'Actual hit rate (%)', fill: '#62626b', fontSize: 10, angle: -90, position: 'insideLeft' }}
          />
          {/* Perfect-calibration diagonal reference line */}
          <ReferenceLine
            segment={[{ x: 40, y: 40 }, { x: 100, y: 100 }]}
            stroke="#3a3a42"
            strokeDasharray="3 3"
            label={{ value: 'perfect', fill: '#62626b', fontSize: 9, position: 'insideTopRight' }}
          />
          <Tooltip
            cursor={{ stroke: '#2a2a31' }}
            contentStyle={{ background: '#070708', border: '1px solid #2a2a31', borderRadius: 4, fontSize: 11, padding: '6px 8px' }}
            formatter={(_v: any, _n: any, props: any) => {
              const d = props.payload;
              return [`pred ${d.x.toFixed(1)}% / actual ${d.y.toFixed(1)}%`, `${d.bucket} (n=${d.n})`];
            }}
            labelFormatter={() => ''}
          />
          <Scatter data={data} fill="#facc15">
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.y >= d.x - 5 ? '#34d399' : d.y >= d.x - 12 ? '#facc15' : '#f87171'}
                r={Math.max(5, Math.min(14, Math.sqrt(d.n) * 1.5))}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
