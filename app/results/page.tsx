import Link from 'next/link';
import { buildSlateInsights, type Opportunity } from '@/lib/insights';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LocalDate } from '@/components/LocalDate';
import { LocalTime } from '@/components/LocalTime';
import { Countdown } from '@/components/Countdown';
import { ymd, shiftYmd } from '@/lib/time';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Circle,
  Activity,
} from 'lucide-react';

export const revalidate = 60;
export const metadata = {
  title: 'Results',
  description: 'Daily model predictions vs actual outcomes — full transparency on hit rate.',
};

type DayAggregate = {
  date: string;
  total: number;
  hits: number;
  misses: number;
  pushes: number;
  pending: number;
  live: number;
  hitRate: number;
  units: number;
  highConfTotal: number;
  highConfHits: number;
  highConfMisses: number;
};

function aggregateOps(ops: Opportunity[]): DayAggregate {
  const hits = ops.filter((o) => o.result === 'hit').length;
  const misses = ops.filter((o) => o.result === 'miss').length;
  const pushes = ops.filter((o) => o.result === 'push').length;
  const pending = ops.filter((o) => o.result === 'pending').length;
  const live = ops.filter((o) => o.result === 'live').length;
  const decided = hits + misses;
  const high = ops.filter((o) => o.confidence === 'high');
  return {
    date: '',
    total: ops.length,
    hits,
    misses,
    pushes,
    pending,
    live,
    hitRate: decided > 0 ? hits / decided : 0,
    units: hits * 1 - misses * 1.1,
    highConfTotal: high.length,
    highConfHits: high.filter((o) => o.result === 'hit').length,
    highConfMisses: high.filter((o) => o.result === 'miss').length,
  };
}

export default async function ResultsPage({ searchParams }: { searchParams: { date?: string } }) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : ymd();

  // Build insights for the selected date + previous 6 days (7 total)
  const dates = Array.from({ length: 7 }, (_, i) => shiftYmd(today, -i)).reverse();
  const allSlates = await Promise.all(
    dates.map((d) => buildSlateInsights(d).catch(() => ({ date: d, games: [], opportunities: [] })))
  );

  const todaySlate = allSlates[allSlates.length - 1];
  const todayAgg = aggregateOps(todaySlate.opportunities);

  // Compute 7-day cumulative aggregates
  const weekAggs = allSlates.map((s, i) => ({ ...aggregateOps(s.opportunities), date: dates[i] }));
  const weekTotal = weekAggs.reduce(
    (acc, a) => ({
      total: acc.total + a.total,
      hits: acc.hits + a.hits,
      misses: acc.misses + a.misses,
      pushes: acc.pushes + a.pushes,
      pending: acc.pending + a.pending,
      live: acc.live + a.live,
      units: acc.units + a.units,
      highConfTotal: acc.highConfTotal + a.highConfTotal,
      highConfHits: acc.highConfHits + a.highConfHits,
      highConfMisses: acc.highConfMisses + a.highConfMisses,
    }),
    { total: 0, hits: 0, misses: 0, pushes: 0, pending: 0, live: 0, units: 0, highConfTotal: 0, highConfHits: 0, highConfMisses: 0 }
  );
  const weekDecided = weekTotal.hits + weekTotal.misses;
  const weekHitRate = weekDecided > 0 ? weekTotal.hits / weekDecided : 0;
  const weekHighConfHitRate =
    weekTotal.highConfHits + weekTotal.highConfMisses > 0
      ? weekTotal.highConfHits / (weekTotal.highConfHits + weekTotal.highConfMisses)
      : 0;

  // Today's predictions — sort: live first, decided after, with high confidence near top
  const allOps = [...todaySlate.opportunities].sort((a, b) => {
    const rank = (o: Opportunity) =>
      o.result === 'live' ? 0 :
      o.result === 'pending' ? 1 :
      o.result === 'hit' ? 2 :
      o.result === 'miss' ? 3 : 4;
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return b.confidenceScore - a.confidenceScore;
  });
  const highConfOps = allOps.filter((o) => o.confidence === 'high');

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Trophy size={22} className="text-accent" />
            Results
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            <LocalDate ymd={today} className="stat-num" />
            <span className="px-1 text-ink-faint">·</span>
            <span>Model predictions vs actual outcomes</span>
            <span className="px-1 text-ink-faint">·</span>
            <AutoRefresh intervalMs={60_000} label="auto-refresh 60s" />
          </p>
        </div>
        <DateNav today={today} />
      </div>

      {/* DAY SCOREBOARD — the headline number */}
      <Panel
        title="Today's scorecard"
        subtitle={`Model performance on ${todayAgg.total} predictions across ${todaySlate.games.length} games`}
        flush
      >
        <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-line">
          <BigTile label="Predictions" value={todayAgg.total.toString()} icon={<Activity size={14} className="text-ink-faint" />} />
          <BigTile
            label="Hits"
            value={todayAgg.hits.toString()}
            accent="pos"
            icon={<CheckCircle2 size={14} className="text-signal-pos" />}
          />
          <BigTile
            label="Misses"
            value={todayAgg.misses.toString()}
            accent="neg"
            icon={<XCircle size={14} className="text-signal-neg" />}
          />
          <BigTile
            label="Hit rate"
            value={todayAgg.hits + todayAgg.misses > 0 ? `${(todayAgg.hitRate * 100).toFixed(1)}%` : '—'}
            accent={todayAgg.hitRate > 0.55 ? 'pos' : todayAgg.hitRate < 0.45 && (todayAgg.hits + todayAgg.misses) > 0 ? 'neg' : undefined}
            big
          />
          <BigTile
            label="Units"
            value={todayAgg.units >= 0 ? `+${todayAgg.units.toFixed(1)}` : todayAgg.units.toFixed(1)}
            accent={todayAgg.units > 0 ? 'pos' : todayAgg.units < 0 ? 'neg' : undefined}
            sub="assume −110 juice"
          />
          <BigTile
            label="Live + pending"
            value={(todayAgg.live + todayAgg.pending).toString()}
            sub={`${todayAgg.live} live · ${todayAgg.pending} pre-game`}
            icon={<Circle size={14} className="text-ink-faint" />}
          />
        </div>

        {/* High-confidence subset breakdown */}
        {todayAgg.highConfTotal > 0 && (
          <div className="px-4 py-3 border-t border-line bg-bg-raised/30">
            <div className="flex items-center justify-between gap-4 flex-wrap text-2xs">
              <div className="flex items-center gap-2">
                <span className="text-2xs uppercase tracking-micro font-bold text-signal-pos">High-confidence subset</span>
                <span className="text-ink-muted">conf ≥ 80</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="stat-num text-ink-muted">
                  <span className="text-ink font-bold">{todayAgg.highConfTotal}</span> picks
                </span>
                <span className="stat-num">
                  <span className="text-signal-pos font-bold">{todayAgg.highConfHits}</span>
                  <span className="text-ink-faint">-</span>
                  <span className="text-signal-neg font-bold">{todayAgg.highConfMisses}</span>
                </span>
                <span className="stat-num text-ink">
                  {todayAgg.highConfHits + todayAgg.highConfMisses > 0
                    ? `${((todayAgg.highConfHits / (todayAgg.highConfHits + todayAgg.highConfMisses)) * 100).toFixed(1)}% hit`
                    : 'all pending'}
                </span>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* 7-DAY HISTORY STRIP */}
      <Panel
        title="Last 7 days"
        subtitle={`${weekTotal.hits}–${weekTotal.misses} (${weekDecided > 0 ? `${(weekHitRate * 100).toFixed(1)}%` : '—'}) overall · ${weekTotal.highConfHits}–${weekTotal.highConfMisses} (${weekTotal.highConfHits + weekTotal.highConfMisses > 0 ? `${(weekHighConfHitRate * 100).toFixed(1)}%` : '—'}) high-conf · ${weekTotal.units >= 0 ? '+' : ''}${weekTotal.units.toFixed(1)}u`}
        flush
      >
        <div className="grid grid-cols-7 divide-x divide-line">
          {weekAggs.map((agg) => {
            const isToday = agg.date === today;
            const netUnit = agg.units;
            const cls =
              netUnit > 0.5 ? 'border-t-signal-pos' :
              netUnit < -0.5 ? 'border-t-signal-neg' :
              'border-t-line';
            return (
              <Link
                key={agg.date}
                href={`/results?date=${agg.date}`}
                className={`block px-3 py-3 border-t-2 ${cls} ${isToday ? 'bg-bg-hover' : 'hover:bg-bg-hover/40'} transition-colors`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-2xs uppercase tracking-micro ${isToday ? 'text-accent font-bold' : 'text-ink-muted'}`}>
                    {dayLabel(agg.date)}
                  </span>
                  {isToday && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                </div>
                <div className="stat-num text-base font-bold text-ink">
                  {agg.hits}<span className="text-ink-faint">-</span>{agg.misses}
                </div>
                <div className="text-2xs text-ink-muted stat-num">
                  {agg.hits + agg.misses > 0 ? `${(agg.hitRate * 100).toFixed(0)}%` : agg.pending > 0 ? `${agg.pending}p` : '—'}
                </div>
                <div className={`text-2xs stat-num mt-0.5 ${agg.units > 0 ? 'text-signal-pos' : agg.units < 0 ? 'text-signal-neg' : 'text-ink-faint'}`}>
                  {agg.units >= 0 ? '+' : ''}{agg.units.toFixed(1)}u
                </div>
              </Link>
            );
          })}
        </div>
      </Panel>

      {/* HIGH-CONFIDENCE PREDICTIONS — bulleted list */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            High-confidence predictions
            <span className="text-2xs px-1.5 py-0.5 rounded border border-signal-pos/30 bg-signal-pos/5 text-signal-pos uppercase tracking-micro">
              conf ≥ 80
            </span>
          </span>
        }
        subtitle={highConfOps.length > 0
          ? `${highConfOps.length} sharp picks on the slate · sorted by status then confidence`
          : 'None of today\'s picks cleared the 80 confidence threshold'}
        flush
      >
        {highConfOps.length === 0 ? (
          <Empty
            title="No high-confidence picks today"
            description={
              allOps.length > 0
                ? `${allOps.length} medium-confidence picks were generated — model wasn't certain enough today to flag any high-conf calls.`
                : 'No preview/live games available yet for this date.'
            }
            icon={<Activity size={28} />}
          />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {highConfOps.map((o, i) => (
              <PickRow key={`${o.category}-${o.gamePk}-${i}`} opp={o} rank={i + 1} />
            ))}
          </ul>
        )}
      </Panel>

      {/* MEDIUM-CONF (collapsed below) */}
      {allOps.filter((o) => o.confidence === 'medium').length > 0 && (
        <Panel
          title="Medium-confidence predictions"
          subtitle={`${allOps.filter((o) => o.confidence === 'medium').length} additional picks at 60–80 confidence · reference only`}
          flush
        >
          <ul className="divide-y divide-line-subtle">
            {allOps
              .filter((o) => o.confidence === 'medium')
              .map((o, i) => (
                <PickRow key={`${o.category}-${o.gamePk}-${i}-med`} opp={o} rank={i + 1} compact />
              ))}
          </ul>
        </Panel>
      )}

      {/* Methodology note */}
      <Panel title="Methodology · for the record">
        <ul className="text-sm text-ink-muted space-y-2 list-disc pl-5">
          <li>
            <span className="text-ink">Every pick is logged at the moment the slate is generated</span>, before
            first pitch. Hits and misses are graded automatically against MLB final scores — no cherry-picking.
          </li>
          <li>
            <span className="text-ink">Hit rate</span> = hits / (hits + misses). Pushes, pending, and live picks
            are excluded from the rate but included in the breakdown for transparency.
          </li>
          <li>
            <span className="text-ink">Units</span> assume standard −110 juice on every pick: +1.00 unit per
            win, −1.10 units per loss, 0 on push.
          </li>
          <li>
            <span className="text-ink">Confidence</span> scores are model-derived (0–100) from input availability
            + signal strength. High = 80+, medium = 60–79.
          </li>
          <li>
            All predictions are transparent — see <Link href="/lab" className="underline">/lab</Link> for the
            formulas and limitations behind each model.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function BigTile({
  label,
  value,
  sub,
  accent,
  icon,
  big = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'pos' | 'neg';
  icon?: React.ReactNode;
  big?: boolean;
}) {
  const cls = accent === 'pos' ? 'text-signal-pos' : accent === 'neg' ? 'text-signal-neg' : 'text-ink';
  return (
    <div className="bg-bg-panel p-4">
      <div className="label-micro flex items-center gap-1.5 mb-1.5">
        {icon}
        {label}
      </div>
      <div className={`stat-num ${big ? 'text-3xl' : 'text-2xl'} font-black ${cls}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-faint mt-1 truncate">{sub}</div>}
    </div>
  );
}

function PickRow({ opp, rank, compact = false }: { opp: Opportunity; rank: number; compact?: boolean }) {
  const resultIcon =
    opp.result === 'hit' ? <CheckCircle2 size={18} className="text-signal-pos" /> :
    opp.result === 'miss' ? <XCircle size={18} className="text-signal-neg" /> :
    opp.result === 'live' ? <Activity size={18} className="text-signal-neg animate-pulse" /> :
    opp.result === 'push' ? <Minus size={18} className="text-ink-muted" /> :
    <Circle size={18} className="text-ink-faint" />;

  const resultLabel =
    opp.result === 'hit' ? 'HIT' :
    opp.result === 'miss' ? 'MISS' :
    opp.result === 'live' ? 'LIVE' :
    opp.result === 'push' ? 'PUSH' :
    'PENDING';

  const resultCls =
    opp.result === 'hit' ? 'border-signal-pos/40 bg-signal-pos/10 text-signal-pos' :
    opp.result === 'miss' ? 'border-signal-neg/40 bg-signal-neg/10 text-signal-neg' :
    opp.result === 'live' ? 'border-signal-neg/40 bg-signal-neg/10 text-signal-neg' :
    opp.result === 'push' ? 'border-ink-muted/30 bg-bg-raised text-ink-muted' :
    'border-line bg-bg-raised text-ink-muted';

  const accentBorder =
    opp.result === 'hit' ? 'border-l-signal-pos' :
    opp.result === 'miss' ? 'border-l-signal-neg' :
    opp.result === 'live' ? 'border-l-signal-neg' :
    'border-l-transparent';

  return (
    <li className={`border-l-2 ${accentBorder}`}>
      <Link href={`/game/${opp.gamePk}`} className="block px-4 py-3 hover:bg-bg-hover/40 transition-colors">
        <div className={`grid ${compact ? 'grid-cols-[28px_auto_1fr_auto]' : 'grid-cols-[28px_auto_1fr_auto]'} gap-3 items-start`}>
          {/* Rank */}
          <span className="stat-num text-2xs text-ink-faint mt-0.5">#{rank}</span>

          {/* Result icon */}
          <div className="flex flex-col items-center gap-1">
            {resultIcon}
            <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${resultCls}`}>
              {resultLabel}
            </span>
          </div>

          {/* Body */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs uppercase tracking-micro font-bold text-ink-muted">
                {opp.category.replace(/-/g, ' ')}
              </span>
              <span className="text-2xs text-ink-faint stat-num">·</span>
              <span className="text-sm font-semibold text-ink truncate">{opp.headline}</span>
            </div>
            {!compact && (
              <p className="text-2xs text-ink-faint mt-1 line-clamp-2">{opp.explanation}</p>
            )}
            <div className="mt-1.5 flex items-baseline gap-3 flex-wrap text-2xs">
              <span className="text-ink-muted">
                <span className="label-micro mr-1">Model</span>
                <span className="stat-num text-ink">{opp.prediction}</span>
              </span>
              {opp.actualText && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className={`stat-num ${
                    opp.result === 'hit' ? 'text-signal-pos' :
                    opp.result === 'miss' ? 'text-signal-neg' :
                    opp.result === 'live' ? 'text-signal-neg' :
                    'text-ink-muted'
                  }`}>
                    <span className="label-micro mr-1">Actual</span>
                    <span className="font-semibold">{opp.actualText}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right rail: confidence + game */}
          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-2xs stat-num text-ink-faint">conf</span>
              <span className={`stat-num text-base font-black ${
                opp.confidenceScore >= 90 ? 'text-signal-pos' :
                opp.confidenceScore >= 80 ? 'text-ink' :
                'text-ink-muted'
              }`}>{opp.confidenceScore}</span>
            </div>
            <span className="text-2xs text-ink-faint stat-num">{opp.gameLabel}</span>
            {opp.result === 'live' || opp.result === 'pending' ? (
              <span className="text-2xs text-ink-faint">
                <LocalTime iso={opp.firstPitch} format="time" />
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

function DateNav({ today }: { today: string }) {
  const yesterday = shiftYmd(today, -1);
  const tomorrow = shiftYmd(today, 1);
  const isToday = today === ymd();
  return (
    <div className="flex items-center gap-1 text-2xs">
      <Link href={`/results?date=${yesterday}`} className="px-1.5 py-1 rounded hover:bg-bg-hover text-ink-muted flex items-center gap-1">
        <ChevronLeft size={12} />
        prev
      </Link>
      {!isToday && (
        <Link href="/results" className="px-2 py-1 rounded hover:bg-bg-hover text-ink-muted">
          today
        </Link>
      )}
      <span className="text-ink px-2 stat-num font-semibold">{today}</span>
      <Link href={`/results?date=${tomorrow}`} className="px-1.5 py-1 rounded hover:bg-bg-hover text-ink-muted flex items-center gap-1">
        next
        <ChevronRight size={12} />
      </Link>
    </div>
  );
}

function dayLabel(date: string): string {
  // YYYY-MM-DD → e.g. "Fri May 15"
  const dt = new Date(`${date}T12:00:00Z`);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
