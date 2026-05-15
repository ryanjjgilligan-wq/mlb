'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Live countdown to a target ISO timestamp. Re-evaluates every second
 * until the target passes, then renders the "ago" form. Pauses when the
 * tab is hidden to avoid burning frames in background tabs.
 */
export function Countdown({
  iso,
  status,
  className,
  prefix,
}: {
  iso: string | undefined | null;
  status?: 'Preview' | 'Live' | 'Final' | string;
  className?: string;
  prefix?: string;
}) {
  const target = iso ? new Date(iso).getTime() : null;
  const [, force] = useState(0);

  useEffect(() => {
    if (!target || status === 'Final') return;
    const tick = () => force((x) => x + 1);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [target, status]);

  if (!target) return null;
  if (status === 'Live') {
    return <span className={cn('text-2xs text-signal-neg uppercase tracking-micro', className)}>in progress</span>;
  }

  const diffMs = target - Date.now();
  const future = diffMs > 0;

  if (status === 'Final' || (!future && Math.abs(diffMs) > 6 * 60 * 60_000)) {
    // Final or > 6h past first pitch — don't bother counting up
    return null;
  }

  const abs = Math.abs(diffMs);
  const hh = Math.floor(abs / 3_600_000);
  const mm = Math.floor((abs % 3_600_000) / 60_000);
  const ss = Math.floor((abs % 60_000) / 1000);
  const parts: string[] = [];
  if (hh > 0) parts.push(`${hh}h`);
  if (hh > 0 || mm > 0) parts.push(`${mm.toString().padStart(2, '0')}m`);
  parts.push(`${ss.toString().padStart(2, '0')}s`);
  const text = parts.join(' ');

  return (
    <span className={cn('stat-num text-2xs', future ? 'text-accent' : 'text-ink-faint', className)} suppressHydrationWarning>
      {prefix}{future ? text : `${text} ago`}
    </span>
  );
}
