import Link from 'next/link';
import {
  getAllGradedPicks,
  getAllPicksDates,
  aggregate,
  aggregateByConfidence,
  aggregateByCategory,
  calibration,
  type LoggedPick,
  type Aggregate,
} from '@/lib/picks';
import { hasPersistence } from '@/lib/picksStore';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { CalibrationChart } from '@/components/CalibrationChart';
import { LocalDate } from '@/components/LocalDate';
import { Award, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

export const revalidate = 600;
export const metadata = {
  title: 'Track record',
  description: 'Every prediction logged, every result graded — public.',
};

export default async function TrackRecordPage() {
  const persisted = await hasPersistence();
  const dates = await getAllPicksDates();
  const allPicks = await getAllGradedPicks(365);
  const overall = aggregate(allPicks);
  const byConf = aggregateByConfidence(allPicks);
  const byCat = aggregateByCategory(allPicks);
  const calib = calibration(allPicks);

  // Date-bucketed performance
  const last7 = aggregate(filterByDateRange(allPicks, 7));
  const last30 = aggregate(filterByDateRange(allPicks, 30));

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Award size={20} className="text-accent" />
          Track record
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Every pick the model has ever made, logged at creation time and auto-graded after
          finals. Public, immutable, no cherry-picking.
        </p>
      </div>

      {!persisted && (
        <Panel
          title={<span className="flex items-center gap-2"><AlertTriangle size={14} className="text-signal-warn" /> Persistent storage not enabled</span>}
        >
          <div className="text-sm text-ink-muted space-y-2">
            <p>
              The track record requires Vercel KV to persist picks across deploys and cold starts.
              Right now picks are only kept in process memory and reset frequently.
            </p>
            <p>
              <span className="text-ink">To enable:</span> in the Vercel dashboard for this project →
              Storage tab → Create → KV. Connect to the project and redeploy. The two env vars
              (<code className="text-2xs bg-bg-sunken px-1 rounded">KV_REST_API_URL</code> and{' '}
              <code className="text-2xs bg-bg-sunken px-1 rounded">KV_REST_API_TOKEN</code>) auto-populate.
              Vercel KV free tier: 30k commands/month + 256MB — way more than this app needs.
            </p>
            <p className="text-2xs text-ink-faint">
              Once connected, the daily Vercel Cron (already configured at 14:00 UTC for snapshot,
              10:00 UTC for grading) will start populating this page automatically.
            </p>
          </div>
        </Panel>
      )}

      {/* Headline scorecard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line panel overflow-hidden">
        <ScoreTile label="All-time picks" value={overall.total.toString()} />
        <ScoreTile label="Record" value={`${overall.wins}-${overall.losses}`} accent={overall.wins > overall.losses} neg={overall.losses > overall.wins} />
        <ScoreTile label="Hit rate" value={overall.total > 0 ? `${(overall.hitRate * 100).toFixed(1)}%` : '—'} accent={overall.hitRate > 0.55} neg={overall.hitRate < 0.45 && overall.hitRate > 0} />
        <ScoreTile label="Units" value={overall.units >= 0 ? `+${overall.units.toFixed(1)}` : overall.units.toFixed(1)} accent={overall.units > 0} neg={overall.units < 0} hint="Assumes -110 juice on every pick" />
        <ScoreTile label="Pending" value={overall.pending.toString()} hint="Awaiting game finals" />
      </div>

      {dates.length === 0 ? (
        <Panel>
          <Empty
            title="No picks logged yet."
            description="Snapshots are taken daily via Vercel Cron. Hit /api/picks/snapshot manually to seed today's picks."
            icon={<Award size={28} />}
          />
        </Panel>
      ) : (
        <>
          {/* Recent windows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="Last 7 days" subtitle="Hot streak / cold streak window">
              <WindowGrid agg={last7} />
            </Panel>
            <Panel title="Last 30 days" subtitle="Rolling-month performance">
              <WindowGrid agg={last30} />
            </Panel>
          </div>

          {/* Calibration */}
          <Panel
            title="Calibration"
            subtitle="When the model says 70%, does it actually hit 70%? Diagonal line = perfectly calibrated."
          >
            <CalibrationChart buckets={calib} />
          </Panel>

          {/* By confidence + by category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="By confidence bucket" subtitle="If 'high' isn't beating 'medium', the confidence model is broken">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                    <th className="text-left font-medium pb-1.5">Bucket</th>
                    <th className="text-right font-medium pb-1.5">N</th>
                    <th className="text-right font-medium pb-1.5">W-L</th>
                    <th className="text-right font-medium pb-1.5">Hit %</th>
                    <th className="text-right font-medium pb-1.5">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(['high', 'medium', 'low'] as const).map((level) => (
                    <ConfidenceRow key={level} level={level} agg={byConf[level]} />
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title="By category" subtitle="Which pick types is the model best at?">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                    <th className="text-left font-medium pb-1.5">Category</th>
                    <th className="text-right font-medium pb-1.5">N</th>
                    <th className="text-right font-medium pb-1.5">W-L</th>
                    <th className="text-right font-medium pb-1.5">Hit %</th>
                    <th className="text-right font-medium pb-1.5">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byCat)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([cat, agg]) => (
                      <tr key={cat} className="row-hover border-b border-line-subtle last:border-0">
                        <td className="py-1.5 capitalize">{cat.replace(/-/g, ' ')}</td>
                        <td className="text-right stat-num text-ink-muted">{agg.total}</td>
                        <td className="text-right stat-num">{agg.wins}-{agg.losses}</td>
                        <td className="text-right stat-num">{agg.total > 0 ? `${(agg.hitRate * 100).toFixed(1)}%` : '—'}</td>
                        <td className={`text-right stat-num ${agg.units > 0 ? 'text-signal-pos' : agg.units < 0 ? 'text-signal-neg' : 'text-ink-muted'}`}>
                          {agg.units > 0 ? `+${agg.units.toFixed(1)}` : agg.units.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Panel>
          </div>

          {/* Last 10 picks heatmap */}
          <Panel title="Last 10 picks" subtitle="Hot streak / cold streak at a glance">
            <div className="flex items-center gap-2 flex-wrap">
              {allPicks.slice(0, 10).reverse().map((p) => (
                <Link
                  key={p.id}
                  href={`/game/${p.gamePk}`}
                  title={`${p.gameLabel} · ${p.side} ${p.line ?? ''} · ${p.actual ?? 'pending'}`}
                  className={`w-9 h-9 rounded flex items-center justify-center text-2xs font-semibold ${
                    p.result === 'win' ? 'bg-signal-pos/20 text-signal-pos border border-signal-pos/40' :
                    p.result === 'loss' ? 'bg-signal-neg/20 text-signal-neg border border-signal-neg/40' :
                    p.result === 'push' ? 'bg-ink-muted/10 text-ink-muted border border-line' :
                    'bg-bg-raised text-ink-faint border border-line border-dashed'
                  }`}
                >
                  {p.result === 'win' ? 'W' : p.result === 'loss' ? 'L' : p.result === 'push' ? 'P' : '·'}
                </Link>
              ))}
            </div>
          </Panel>

          {/* Full pick log */}
          <Panel
            title={`Full pick log · ${allPicks.length} picks`}
            subtitle="Every pick ever made, immutable timestamp, public outcome"
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                    <th className="text-left font-medium px-3 py-2">Date</th>
                    <th className="text-left font-medium px-2 py-2">Game</th>
                    <th className="text-left font-medium px-2 py-2">Pick</th>
                    <th className="text-right font-medium px-2 py-2">Conf</th>
                    <th className="text-right font-medium px-2 py-2">Result</th>
                    <th className="text-right font-medium px-3 py-2">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {allPicks.slice(0, 200).map((p) => (
                    <tr key={p.id} className="row-hover border-b border-line-subtle last:border-0">
                      <td className="px-3 py-1.5 text-2xs">
                        <LocalDate ymd={p.date} className="stat-num" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Link href={`/game/${p.gamePk}`} className="text-sm hover:text-accent">{p.gameLabel}</Link>
                      </td>
                      <td className="px-2 py-1.5 capitalize text-2xs">
                        {p.category.replace(/-/g, ' ')} · <span className="text-ink">{p.side}{p.line != null ? ` ${p.line}` : ''}</span>
                      </td>
                      <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{p.confidence}</td>
                      <td className="text-right px-2 py-1.5">
                        <ResultBadge result={p.result} />
                      </td>
                      <td className="text-right stat-num px-3 py-1.5 text-ink-muted">{p.actual ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function ScoreTile({ label, value, accent, neg, hint }: { label: string; value: string; accent?: boolean; neg?: boolean; hint?: string }) {
  const cls = accent ? 'text-signal-pos' : neg ? 'text-signal-neg' : 'text-ink';
  return (
    <div className="bg-bg-panel p-4" title={hint}>
      <div className="label-micro">{label}</div>
      <div className={`stat-num text-2xl font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

function WindowGrid({ agg }: { agg: Aggregate }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat label="W-L" value={`${agg.wins}-${agg.losses}`} />
      <Stat label="Hit %" value={agg.total > 0 ? `${(agg.hitRate * 100).toFixed(1)}%` : '—'} />
      <Stat label="Units" value={agg.units >= 0 ? `+${agg.units.toFixed(1)}` : agg.units.toFixed(1)} accent={agg.units > 0} neg={agg.units < 0} />
    </div>
  );
}

function Stat({ label, value, accent, neg }: { label: string; value: string; accent?: boolean; neg?: boolean }) {
  const cls = accent ? 'text-signal-pos' : neg ? 'text-signal-neg' : 'text-ink';
  return (
    <div>
      <div className="label-micro">{label}</div>
      <div className={`stat-num text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function ConfidenceRow({ level, agg }: { level: 'high' | 'medium' | 'low'; agg: Aggregate }) {
  const color = level === 'high' ? 'text-signal-pos' : level === 'medium' ? 'text-signal-info' : 'text-ink-muted';
  return (
    <tr className="row-hover border-b border-line-subtle last:border-0">
      <td className={`py-1.5 capitalize ${color}`}>{level}</td>
      <td className="text-right stat-num text-ink-muted">{agg.total}</td>
      <td className="text-right stat-num">{agg.wins}-{agg.losses}</td>
      <td className="text-right stat-num">{agg.total > 0 ? `${(agg.hitRate * 100).toFixed(1)}%` : '—'}</td>
      <td className={`text-right stat-num ${agg.units > 0 ? 'text-signal-pos' : agg.units < 0 ? 'text-signal-neg' : 'text-ink-muted'}`}>
        {agg.units > 0 ? `+${agg.units.toFixed(1)}` : agg.units.toFixed(1)}
      </td>
    </tr>
  );
}

function ResultBadge({ result }: { result?: string }) {
  if (!result || result === 'pending')
    return <Badge>pending</Badge>;
  if (result === 'win') return <Badge variant="pos">W</Badge>;
  if (result === 'loss') return <Badge variant="neg">L</Badge>;
  if (result === 'push') return <Badge>push</Badge>;
  return <Badge>{result}</Badge>;
}

function filterByDateRange(picks: LoggedPick[], days: number): LoggedPick[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return picks.filter((p) => p.date >= cutoffStr);
}
