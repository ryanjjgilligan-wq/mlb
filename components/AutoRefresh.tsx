'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Pause } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Drops into pages with time-sensitive data. Calls router.refresh() on an
 * interval, which re-fetches the Server Component payload — picking up any
 * data whose Vercel cache window has expired. No WebSockets, no SSE — just
 * leveraging Next's revalidation.
 *
 * Pauses automatically when the tab is hidden so we don't burn quota in
 * background tabs.
 */
export function AutoRefresh({
  intervalMs,
  label = 'live',
  className,
}: {
  intervalMs: number;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    if (paused) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          router.refresh();
          setLastRefresh(new Date());
          setTick((t) => t + 1);
        }
      }, intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        stop();
        // refresh once on tab focus, then resume the cadence
        router.refresh();
        setLastRefresh(new Date());
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [router, intervalMs, paused]);

  // Re-render the "Xs ago" string every 5s
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const secondsAgo = lastRefresh
    ? Math.max(0, Math.round((Date.now() - lastRefresh.getTime()) / 1000))
    : null;

  return (
    <button
      onClick={() => setPaused((p) => !p)}
      title={paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
      className={cn(
        'inline-flex items-center gap-1.5 text-2xs uppercase tracking-micro',
        paused ? 'text-ink-faint' : 'text-signal-pos',
        className
      )}
    >
      {paused ? (
        <>
          <Pause size={10} />
          <span>paused</span>
        </>
      ) : (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-current" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
          </span>
          <span>{label}</span>
        </>
      )}
      {secondsAgo !== null && !paused && (
        <span className="text-ink-faint normal-case tracking-normal">
          · <span className="stat-num">{secondsAgo}s ago</span>
        </span>
      )}
    </button>
  );
}
