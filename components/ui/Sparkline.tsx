'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

export function Sparkline({
  values,
  width = 80,
  height = 22,
  className,
  positive = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  positive?: boolean;
}) {
  const id = useId();
  if (!values.length) return <div className={cn('text-ink-faint text-2xs', className)}>—</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  const stroke = positive ? '#34d399' : '#f87171';

  return (
    <svg width={width} height={height} className={cn('overflow-visible', className)}>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="1.6" fill={stroke} />
    </svg>
  );
}
