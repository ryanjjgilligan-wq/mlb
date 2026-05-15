/**
 * Browser-local watchlist. Persisted in localStorage under `diamondiq:watch`.
 * Cross-device sync would require auth + a server-side store — intentionally
 * not bundled (see /lab).
 */
'use client';

import { useEffect, useState, useCallback } from 'react';

export type WatchItem = {
  type: 'player' | 'team';
  id: number;
  name: string;
  addedAt: number;
  meta?: string;
};

const KEY = 'diamondiq:watch';

function read(): WatchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: WatchItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('diamondiq:watch'));
  } catch {
    // quota / private mode — no-op
  }
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    setItems(read());
    const sync = () => setItems(read());
    window.addEventListener('diamondiq:watch', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('diamondiq:watch', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isWatched = useCallback(
    (type: 'player' | 'team', id: number) =>
      items.some((i) => i.type === type && i.id === id),
    [items]
  );

  const add = useCallback((item: Omit<WatchItem, 'addedAt'>) => {
    const next = read();
    if (next.some((i) => i.type === item.type && i.id === item.id)) return;
    next.push({ ...item, addedAt: Date.now() });
    write(next);
  }, []);

  const remove = useCallback((type: 'player' | 'team', id: number) => {
    const next = read().filter((i) => !(i.type === type && i.id === id));
    write(next);
  }, []);

  const toggle = useCallback((item: Omit<WatchItem, 'addedAt'>) => {
    const exists = read().some((i) => i.type === item.type && i.id === item.id);
    if (exists) {
      const next = read().filter((i) => !(i.type === item.type && i.id === item.id));
      write(next);
    } else {
      const next = read();
      next.push({ ...item, addedAt: Date.now() });
      write(next);
    }
  }, []);

  return { items, isWatched, add, remove, toggle };
}
