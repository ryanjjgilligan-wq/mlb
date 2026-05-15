'use client';

import { useEffect, useState } from 'react';

/**
 * Polls /api/live-count every 60s. Renders a small pulsing red dot with the
 * count of live games, or nothing if there are none.
 */
export function LiveDot() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/live-count', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCount(data.live ?? 0);
      } catch {
        // ignore
      }
    };

    poll();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') poll();
    }, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (count === null || count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-2xs">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-signal-neg" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal-neg" />
      </span>
      <span className="stat-num text-signal-neg font-medium">{count}</span>
    </span>
  );
}
