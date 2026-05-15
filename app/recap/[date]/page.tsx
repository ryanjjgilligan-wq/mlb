import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPicksForDate, aggregate, type LoggedPick } from '@/lib/picks';
import { hasPersistence } from '@/lib/picksStore';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { LocalDate } from '@/components/LocalDate';
import { ymd, shiftYmd } from '@/lib/time';
import { Trophy, X as XIcon, AlertTriangle, ChevronRight, ChevronLeft, Share2 } from 'lucide-react';

export const revalidate = 600;

export async function generateMetadata({ params }: { params: { date: string } }) {
  return { title: `Daily recap · ${params.date}` };
}

export default async function RecapPage({ params }: { params: { date: string } }) {
  const date = params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const persisted = await hasPersistence();
  const snap = await getPicksForDate(date);

  const prev = shiftYmd(date, -1);
  const next = shiftYmd(date, 1);
  const isFuture = date > ymd();

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Trophy size={20} className="text-accent" />
            Daily recap
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2">
            <LocalDate ymd={date} className="stat-num" />
            <span className="text-ink-faint">·</span>
            <span>{snap?.picks.length ?? 0} logged picks</span>
          </p>
        </div>
        <div className="flex items-center gap-1 text-2xs">
          <Link href={`/recap/${prev}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted flex items-center gap-1">
            <ChevronLeft size={12} /> prev
          </Link>
          <span className="text-ink-muted px-1 stat-num">{date}</span>
          <Link href={`/recap/${next}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted flex items-center gap-1">
            next <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {!persisted && (
        <Panel title={<span className="flex items-center gap-2"><AlertTriangle size={14} className="text-signal-warn" /> Persistent storage not enabled</span>}>
          <p className="text-sm text-ink-muted">
            Picks aren't being persisted yet. Enable Vercel KV from the project's Storage tab to start
            logging — enable Vercel KV to persist daily recaps.
          </p>
        </Panel>
      )}

      {!snap ? (
        <Panel>
          <Empty
            title={isFuture ? 'No picks yet for this date.' : 'No snapshot was taken for this date.'}
            description={isFuture
              ? 'Snapshots are taken daily at 14:00 UTC by Vercel Cron, or call /api/picks/snapshot manually.'
              : 'Either no picks were logged, or this date predates persistent storage being enabled.'}
            icon={<Trophy size={28} />}
          />
        </Panel>
      ) : (
        <RecapContent snap={snap} />
      )}
    </div>
  );
}

function RecapContent({ snap }: { snap: { date: string; createdAt: number; picks: LoggedPick[] } }) {
  const agg = aggregate(snap.picks);
  const decided = snap.picks.filter((p) => p.result === 'win' || p.result === 'loss');
  const wins = snap.picks.filter((p) => p.result === 'win').sort((a, b) => b.confidence - a.confidence);
  const losses = snap.picks.filter((p) => p.result === 'loss').sort((a, b) => a.confidence - b.confidence);
  const stillPending = snap.picks.filter((p) => p.result === 'pending' || !p.result);

  return (
    <>
      {/* Big scoreboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line panel overflow-hidden">
        <Tile label="Picks" value={agg.total.toString()} />
        <Tile label="Record" value={`${agg.wins}-${agg.losses}`} accent={agg.wins > agg.losses} neg={agg.losses > agg.wins} />
        <Tile label="Hit %" value={decided.length > 0 ? `${(agg.hitRate * 100).toFixed(1)}%` : '—'} accent={agg.hitRate > 0.55} neg={agg.hitRate < 0.45 && decided.length > 0} />
        <Tile label="Units" value={agg.units >= 0 ? `+${agg.units.toFixed(1)}` : agg.units.toFixed(1)} accent={agg.units > 0} neg={agg.units < 0} />
        <Tile label="Pending" value={agg.pending.toString()} />
      </div>

      {/* One-line tweet-ready summary */}
      <Panel
        title={<span className="flex items-center gap-2"><Share2 size={14} /> Tweet-ready summary</span>}
        actions={
          <Link href={`/api/og/recap?date=${snap.date}`} target="_blank" className="text-2xs text-ink-muted hover:text-ink underline">
            open as image →
          </Link>
        }
      >
        <pre className="text-sm bg-bg-sunken border border-line rounded p-3 whitespace-pre-wrap font-mono text-ink">
{buildTweet(snap.date, agg, wins[0], losses[0])}
        </pre>
      </Panel>

      {/* Best calls + worst calls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title={<span className="text-signal-pos">Best calls</span>}
          subtitle="Wins ranked by confidence"
          flush
        >
          {wins.length === 0 ? (
            <Empty title="No winners yet." description="Either still pending or all decided picks lost." icon={<Trophy size={28} />} />
          ) : (
            <PickList picks={wins.slice(0, 8)} />
          )}
        </Panel>

        <Panel
          title={<span className="text-signal-neg">Misses</span>}
          subtitle="Losses ranked by confidence (highest-conf misses are the most informative)"
          flush
        >
          {losses.length === 0 ? (
            <Empty title="No losses." description="Either all decided picks won or none have been graded yet." icon={<XIcon size={28} />} />
          ) : (
            <PickList picks={losses.slice(0, 8)} />
          )}
        </Panel>
      </div>

      {/* Still pending */}
      {stillPending.length > 0 && (
        <Panel title={`Still pending · ${stillPending.length}`} subtitle="Awaiting game finals" flush>
          <PickList picks={stillPending} showResult={false} />
        </Panel>
      )}
    </>
  );
}

function Tile({ label, value, accent, neg, hint }: { label: string; value: string; accent?: boolean; neg?: boolean; hint?: string }) {
  const cls = accent ? 'text-signal-pos' : neg ? 'text-signal-neg' : 'text-ink';
  return (
    <div className="bg-bg-panel p-4" title={hint}>
      <div className="label-micro">{label}</div>
      <div className={`stat-num text-2xl font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

function PickList({ picks, showResult = true }: { picks: LoggedPick[]; showResult?: boolean }) {
  return (
    <ul className="divide-y divide-line-subtle">
      {picks.map((p) => (
        <li key={p.id}>
          <Link href={`/game/${p.gamePk}`} className="block px-3 py-2.5 row-hover">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{p.gameLabel}</span>
                  <Badge>{p.category.replace(/-/g, ' ')}</Badge>
                  <span className="text-2xs text-ink stat-num">{p.side}{p.line != null ? ` ${p.line}` : ''}</span>
                </div>
                <p className="text-2xs text-ink-muted mt-1 line-clamp-2">{p.explanation}</p>
              </div>
              <div className="text-right shrink-0">
                {showResult && (
                  <div className="mb-1">
                    {p.result === 'win' ? <Badge variant="pos">W</Badge> :
                     p.result === 'loss' ? <Badge variant="neg">L</Badge> :
                     p.result === 'push' ? <Badge>push</Badge> :
                     <Badge>pending</Badge>}
                  </div>
                )}
                <div className="text-2xs text-ink-faint stat-num">conf {p.confidence}</div>
                {p.actual && <div className="text-2xs text-ink-muted stat-num">{p.actual}</div>}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function buildTweet(date: string, agg: any, bestWin: any, biggestMiss: any): string {
  const lines: string[] = [];
  lines.push(`📊 DiamondIQ · ${date}`);
  lines.push('');
  lines.push(`Picks: ${agg.wins}-${agg.losses} (${agg.total > 0 ? (agg.hitRate * 100).toFixed(1) : '0'}%) · ${agg.units >= 0 ? '+' : ''}${agg.units.toFixed(1)}u`);
  if (bestWin) {
    lines.push('');
    lines.push(`Best call: ${bestWin.gameLabel} · ${bestWin.side}${bestWin.line != null ? ' ' + bestWin.line : ''} → ${bestWin.actual}`);
  }
  if (biggestMiss) {
    lines.push(`Big miss: ${biggestMiss.gameLabel} · ${biggestMiss.side}${biggestMiss.line != null ? ' ' + biggestMiss.line : ''} → ${biggestMiss.actual}`);
  }
  lines.push('');
  lines.push(`See full slate at diamondiq.com/recap`);
  return lines.join('\n');
}
