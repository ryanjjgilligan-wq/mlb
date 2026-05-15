'use client';

import { cn } from '@/lib/cn';
import { Tooltip } from './ui/Tooltip';

/**
 * A Savant-style percentile bar. Value should be 0–100 with 50 being league average.
 */
export function PercentileBar({
  label,
  value,
  raw,
  hint,
}: {
  label: string;
  value: number; // 0–100
  raw?: string | number;
  hint?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  // Color from cool (blue, low) to warm (red, high) — Savant palette
  const color = colorScale(v);
  const offset = `calc(${v}% - 8px)`;

  return (
    <div className="grid grid-cols-[140px_1fr_56px] items-center gap-3 py-1.5">
      <Tooltip content={hint ?? label}>
        <span className="text-2xs text-ink-muted truncate cursor-help">{label}</span>
      </Tooltip>
      <div className="relative h-2.5">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#3b82f6] via-[#e5e7eb] to-[#ef4444] opacity-30" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-bg shadow-md"
          style={{ left: offset, background: color }}
        />
      </div>
      <div className="text-right">
        <div className="stat-num text-sm font-medium">{raw ?? '—'}</div>
        <div className="stat-num text-2xs text-ink-faint">p{Math.round(v)}</div>
      </div>
    </div>
  );
}

function colorScale(v: number): string {
  // Interpolate red→neutral→blue (Savant uses red=elite, blue=poor)
  if (v >= 50) {
    const t = (v - 50) / 50;
    return interp([229, 231, 235], [239, 68, 68], t);
  } else {
    const t = (50 - v) / 50;
    return interp([229, 231, 235], [59, 130, 246], t);
  }
}

function interp(a: number[], b: number[], t: number): string {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
