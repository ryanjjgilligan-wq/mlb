'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Hit = {
  type: 'player' | 'team';
  id: number;
  name: string;
  meta?: string;
};

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQ('');
      setHits([]);
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    if (!q || q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) setHits(data.hits ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const go = (hit: Hit) => {
    router.push(hit.type === 'player' ? `/player/${hit.id}` : `/team/${hit.id}`);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-2 py-1 text-2xs text-ink-muted bg-bg-raised border border-line rounded hover:bg-bg-hover transition-colors"
        aria-label="Search players and teams"
      >
        <Search size={12} />
        <span className="hidden sm:inline">Search</span>
        <span className="kbd hidden sm:inline">⌘K</span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-bg-panel border border-line-strong rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 border-b border-line">
              <Search size={14} className="text-ink-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, hits.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (hits[cursor]) go(hits[cursor]);
                  }
                }}
                placeholder="Search players or teams…"
                className="flex-1 py-3 bg-transparent outline-none text-sm placeholder:text-ink-faint"
              />
              {loading && <Loader2 size={14} className="text-ink-muted animate-spin" />}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-ink-muted hover:text-ink"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {hits.length === 0 && q.length >= 2 && !loading && (
                <div className="px-4 py-6 text-2xs text-ink-muted text-center">No matches.</div>
              )}
              {hits.length === 0 && q.length < 2 && (
                <div className="px-4 py-6 text-2xs text-ink-muted text-center">
                  Type a player or team name. ↑↓ to navigate, ⏎ to open.
                </div>
              )}
              {hits.map((h, i) => (
                <button
                  key={`${h.type}-${h.id}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(h)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-left text-sm',
                    cursor === i ? 'bg-bg-hover' : ''
                  )}
                >
                  <span className="truncate">{h.name}</span>
                  <span className="text-2xs text-ink-faint uppercase tracking-micro">
                    {h.type === 'player' ? h.meta || 'Player' : 'Team'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
