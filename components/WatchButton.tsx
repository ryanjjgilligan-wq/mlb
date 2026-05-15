'use client';

import { Star } from 'lucide-react';
import { useWatchlist } from '@/lib/watchlist';
import { cn } from '@/lib/cn';

export function WatchButton({
  type,
  id,
  name,
  meta,
  size = 'md',
}: {
  type: 'player' | 'team';
  id: number;
  name: string;
  meta?: string;
  size?: 'sm' | 'md';
}) {
  const { isWatched, toggle } = useWatchlist();
  const on = isWatched(type, id);
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <button
      onClick={() => toggle({ type, id, name, meta })}
      title={on ? 'Remove from watchlist' : 'Add to watchlist'}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded border text-2xs transition-colors',
        on
          ? 'border-accent/40 text-accent bg-accent/10 hover:bg-accent/15'
          : 'border-line text-ink-muted hover:text-ink hover:bg-bg-hover'
      )}
    >
      <Star size={iconSize} fill={on ? 'currentColor' : 'none'} />
      <span>{on ? 'Watching' : 'Watch'}</span>
    </button>
  );
}
