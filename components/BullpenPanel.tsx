import Link from 'next/link';
import { Badge } from './ui/Badge';
import { Empty } from './ui/Empty';
import type { BullpenSummary } from '@/lib/bullpen';

export function BullpenPanel({
  summary,
  teamName,
}: {
  summary: BullpenSummary;
  teamName: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pt-4 pb-2">
        <Tile label="Fatigue score" value={`${summary.fatigueScore}/100`} variant={
          summary.fatigueScore >= 75 ? 'pos' : summary.fatigueScore <= 45 ? 'neg' : 'neutral'
        } hint="100 = fully rested · 0 = depleted" />
        <Tile label="Pitches (3d)" value={summary.totalPitches3d.toString()} hint="Total bullpen pitches in last 3 days" />
        <Tile label="Fresh / Tired / Gassed" value={`${summary.freshCount} / ${summary.tiredCount} / ${summary.gassedCount}`} />
        <Tile label="Bullpen size" value={summary.pitchers.length.toString()} hint="Arms that appeared in last 3 days" />
      </div>

      {summary.pitchers.length === 0 ? (
        <Empty title="No recent bullpen activity to score." description="Try again after a few games are played." />
      ) : (
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
              <th className="text-left font-medium px-3 py-2">Pitcher</th>
              <th className="text-right font-medium px-2 py-2">P (3d)</th>
              <th className="text-right font-medium px-2 py-2">Apps</th>
              <th className="text-center font-medium px-2 py-2">Yesterday</th>
              <th className="text-center font-medium px-2 py-2">Day before</th>
              <th className="text-right font-medium px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.pitchers.map((p) => (
              <tr key={p.id} className="row-hover border-b border-line-subtle last:border-0">
                <td className="px-3 py-1.5 truncate">
                  <Link href={`/player/${p.id}`} className="text-sm hover:text-accent">{p.name}</Link>
                  {p.throws && <span className="text-2xs text-ink-faint ml-1.5">{p.throws}HP</span>}
                </td>
                <td className="text-right stat-num px-2 py-1.5 text-ink">{p.totalPitches3d}</td>
                <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{p.appearances3d}</td>
                <td className="text-center px-2 py-1.5">
                  {p.pitchedYesterday ? (
                    <span className="text-2xs stat-num text-signal-warn">{pitchesOn(p.pitchesByDay, -1)}</span>
                  ) : <span className="text-ink-faint">—</span>}
                </td>
                <td className="text-center px-2 py-1.5">
                  {p.pitchedDayBefore ? (
                    <span className="text-2xs stat-num text-signal-warn">{pitchesOn(p.pitchesByDay, -2)}</span>
                  ) : <span className="text-ink-faint">—</span>}
                </td>
                <td className="text-right px-3 py-1.5">
                  <Badge variant={p.status === 'fresh' ? 'pos' : p.status === 'tired' ? 'warn' : 'neg'}>
                    {p.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-2xs text-ink-faint px-4 py-3">
        Window: <span className="stat-num">{summary.scanWindow.start} → {summary.scanWindow.end}</span>.
        Fresh ≤25P 3d & not yesterday. Tired ≤55P 3d or pitched yesterday. Gassed &gt;55P 3d or back-to-back days.
        Starters auto-excluded (any single-day workload ≥ 70 pitches treated as starter, not bullpen).
      </p>
    </div>
  );
}

function pitchesOn(byDay: { date: string; pitches: number }[], _delta: number): number {
  // We just take the most recent (or the day before)
  if (byDay.length === 0) return 0;
  // sort by date desc
  const sorted = [...byDay].sort((a, b) => b.date.localeCompare(a.date));
  const idx = _delta === -1 ? 0 : 1;
  return sorted[idx]?.pitches ?? 0;
}

function Tile({ label, value, hint, variant = 'neutral' }: { label: string; value: string; hint?: string; variant?: 'pos' | 'neg' | 'neutral' }) {
  const cls =
    variant === 'pos' ? 'text-signal-pos' : variant === 'neg' ? 'text-signal-neg' : 'text-ink';
  return (
    <div title={hint}>
      <div className="label-micro">{label}</div>
      <div className={`stat-num text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
