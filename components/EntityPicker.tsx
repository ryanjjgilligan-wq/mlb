'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Hit = { type: 'player' | 'team'; id: number; name: string; meta?: string };

type Mode = 'hitter' | 'pitcher' | 'team';

const MAX_PER_TYPE = 4;

/**
 * URL-driven multi-entity picker. Reads `players` and `teams` from the URL,
 * lets the user add up to 4 of each by searching, and removes by clicking
 * the chip's X. All changes update the URL so comparisons are shareable.
 */
export function EntityPicker({
  current,
  mode,
}: {
  current: { type: 'player' | 'team'; id: number; name: string; meta?: string }[];
  mode: Mode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const wantsPlayer = mode !== 'team';
  const wantsTeam = mode === 'team';

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 10);
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
        if (!cancelled) {
          const filtered = (data.hits ?? []).filter((h: Hit) =>
            wantsPlayer ? h.type === 'player' : h.type === 'team'
          );
          setHits(filtered);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, wantsPlayer]);

  const updateUrl = (nextItems: typeof current) => {
    const params = new URLSearchParams(searchParams.toString());
    const players = nextItems.filter((i) => i.type === 'player').map((i) => i.id);
    const teams = nextItems.filter((i) => i.type === 'team').map((i) => i.id);
    if (players.length) params.set('players', players.join(',')); else params.delete('players');
    if (teams.length) params.set('teams', teams.join(',')); else params.delete('teams');
    params.set('mode', mode);
    router.push(`/compare?${params.toString()}`);
  };

  const add = (h: Hit) => {
    const sameType = current.filter((i) => i.type === h.type);
    if (sameType.length >= MAX_PER_TYPE) return;
    if (current.some((i) => i.type === h.type && i.id === h.id)) return;
    updateUrl([...current, { type: h.type, id: h.id, name: h.name, meta: h.meta }]);
    setOpen(false);
    setQ('');
    setHits([]);
  };

  const remove = (type: 'player' | 'team', id: number) => {
    updateUrl(current.filter((i) => !(i.type === type && i.id === id)));
  };

  const setMode = (m: Mode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('mode', m);
    router.push(`/compare?${params.toString()}`);
  };

  const sameTypeCount = current.filter((i) => (wantsTeam ? i.type === 'team' : i.type === 'player')).length;
  const canAddMore = sameTypeCount < MAX_PER_TYPE;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="label-micro">Mode</span>
        {(['hitter', 'pitcher', 'team'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'px-2 py-0.5 rounded text-2xs uppercase tracking-micro border transition-colors',
              mode === m
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'border-line text-ink-muted hover:text-ink hover:bg-bg-hover'
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {current.map((item) => (
          <Chip key={`${item.type}-${item.id}`} item={item} onRemove={() => remove(item.type, item.id)} />
        ))}
        {canAddMore && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-dashed border-line text-2xs text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors"
          >
            <Plus size={12} />
            Add {wantsTeam ? 'team' : 'player'}
          </button>
        )}
        {!canAddMore && (
          <span className="text-2xs text-ink-faint">Max {MAX_PER_TYPE} {wantsTeam ? 'teams' : 'players'} per comparison</span>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-bg-panel border border-line-strong rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 border-b border-line">
              <Search size={14} className="text-ink-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${wantsTeam ? 'teams' : 'players'}…`}
                className="flex-1 py-3 bg-transparent outline-none text-sm placeholder:text-ink-faint"
              />
              {loading && <Loader2 size={14} className="text-ink-muted animate-spin" />}
              <button onClick={() => setOpen(false)} className="p-1 text-ink-muted hover:text-ink" aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {hits.length === 0 && q.length >= 2 && !loading && (
                <div className="px-4 py-6 text-2xs text-ink-muted text-center">No matches.</div>
              )}
              {hits.length === 0 && q.length < 2 && (
                <div className="px-4 py-6 text-2xs text-ink-muted text-center">Type a name…</div>
              )}
              {hits.map((h) => (
                <button
                  key={`${h.type}-${h.id}`}
                  onClick={() => add(h)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-hover"
                >
                  <span className="truncate">{h.name}</span>
                  <span className="text-2xs text-ink-faint uppercase tracking-micro">
                    {h.meta ?? h.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  item,
  onRemove,
}: {
  item: { type: 'player' | 'team'; id: number; name: string; meta?: string };
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-line bg-bg-raised text-2xs">
      <span className="text-ink-faint uppercase tracking-micro">{item.type}</span>
      <span className="text-ink">{item.name}</span>
      <button onClick={onRemove} className="text-ink-faint hover:text-signal-neg" aria-label="Remove">
        <X size={11} />
      </button>
    </span>
  );
}
