'use client';

import Link from 'next/link';
import { useWatchlist } from '@/lib/watchlist';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { teamCapLogoUrl, playerHeadshotUrl } from '@/lib/mlb';
import { Star, X } from 'lucide-react';

export default function WatchlistPage() {
  const { items, remove } = useWatchlist();
  const players = items.filter((i) => i.type === 'player');
  const teams = items.filter((i) => i.type === 'team');

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Star size={20} className="text-accent" fill="currentColor" />
          Watchlist
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Stored locally in your browser. Cross-device sync requires auth — listed on{' '}
          <Link href="/lab" className="underline">/lab</Link> as a planned upgrade.
        </p>
      </header>

      {items.length === 0 ? (
        <Panel>
          <Empty
            title="Nothing pinned yet."
            description="Hit the star on any player or team page to add them here."
            icon={<Star size={28} />}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title={`Teams · ${teams.length}`} flush>
            {teams.length === 0 ? (
              <div className="px-3 py-4 text-2xs text-ink-faint">No teams pinned.</div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {teams.map((item) => (
                  <li key={`team-${item.id}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                    <Link href={`/team/${item.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <img src={teamCapLogoUrl(item.id)} alt="" className="w-6 h-6 team-logo opacity-90" />
                      <span className="text-sm truncate">{item.name}</span>
                      {item.meta && <Badge>{item.meta}</Badge>}
                    </Link>
                    <button
                      onClick={() => remove('team', item.id)}
                      className="p-1 text-ink-faint hover:text-signal-neg"
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Players · ${players.length}`} flush>
            {players.length === 0 ? (
              <div className="px-3 py-4 text-2xs text-ink-faint">No players pinned.</div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {players.map((item) => (
                  <li key={`player-${item.id}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                    <Link href={`/player/${item.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <img
                        src={playerHeadshotUrl(item.id, 60)}
                        alt=""
                        className="w-7 h-7 rounded-full bg-bg-raised object-cover"
                      />
                      <span className="text-sm truncate">{item.name}</span>
                      {item.meta && <span className="text-2xs text-ink-faint truncate">{item.meta}</span>}
                    </Link>
                    <button
                      onClick={() => remove('player', item.id)}
                      className="p-1 text-ink-faint hover:text-signal-neg"
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
