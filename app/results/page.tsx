import Link from 'next/link';
import { buildSlateInsights } from '@/lib/insights';
import { buildAllPicks, aggregatePicks, type ConvictionPick, type PickCategory } from '@/lib/highConvictionPicks';
import { Panel } from '@/components/ui/Panel';
import { Empty } from '@/components/ui/Empty';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LocalDate } from '@/components/LocalDate';
import { LocalTime } from '@/components/LocalTime';
import { ymd, shiftYmd } from '@/lib/time';
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Circle,
  Activity,
  Crown,
  Zap,
  Hourglass,
  Shield,
  BarChart3,
} from 'lucide-react';

export const revalidate = 60;
export const metadata = {
  title: 'Results',
  description: 'Model predictions vs actual results — winners, K props, F5, NRFI/YRFI, run totals.',
};

const CATEGORY_META: Record<PickCategory, { label: string; sublabel: string; icon: any; color: string }> = {
  winner:       { label: 'Winners',       sublabel: 'Moneyline picks · > 60% home or away',   icon: Crown,     color: 'text-accent' },
  'pitcher-k':  { label: 'Pitcher Ks',    sublabel: 'Strikeout over-line props · > 60%',      icon: Zap,        color: 'text-signal-info' },
  f5:           { label: 'First 5',       sublabel: 'F5 over/under · > 60%',                  icon: Hourglass,  color: 'text-signal-info' },
  'nrfi-yrfi':  { label: 'NRFI / YRFI',   sublabel: '1st-inning runs · > 60%',                icon: Shield,     color: 'text-signal-pos' },
  'total-runs': { label: 'Total runs',    sublabel: 'Full-game over/under · > 60%',           icon: BarChart3,  color: 'text-signal-info' },
};

const CATEGORIES: PickCategory[] = ['winner', 'pitcher-k', 'f5', 'nrfi-yrfi', 'total-runs'];

export default async function ResultsPage({ searchParams }: { searchParams: { date?: string } }) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : ymd();

  // Last 7 days (selected date + 6 prior) in parallel
  const dates = Array.from({ length: 7 }, (_, i) => shiftYmd(today, -i)).reverse();
  const allSlates = await Promise.all(
    dates.map((d) =>
      buildSlateInsights(d)
        .then((s) => ({ date: d, picks: buildAllPicks(s.games, 0.60), games: s.games.length }))
        .catch(() => ({ date: d, picks: [] as ConvictionPick[], games: 0 }))
    )
  );

  const todaySlate = allSlates[allSlates.length - 1];
  const todayAgg = aggregatePicks(todaySlate.picks);

  // Week aggregates
  const weekAggs = allSlates.map((s) => ({ date: s.date, games: s.games, ...aggregatePicks(s.picks) }));
  const weekTotal = weekAggs.reduce(
    (acc, a) => ({
      total: acc.total + a.total,
      hits: acc.hits + a.hits,
      misses: acc.misses + a.misses,
      units: acc.units + a.units,
    }),
    { total: 0, hits: 0, misses: 0, units: 0 }
  );
  const weekDecided = weekTotal.hits + weekTotal.misses;
  const weekHitRate = weekDecided > 0 ? weekTotal.hits / weekDecided : 0;

  // Group today's picks by category
  const byCategory: Record<PickCategory, ConvictionPick[]> = {
    winner: [],
    'pitcher-k': [],
    f5: [],
    'nrfi-yrfi': [],
    'total-runs': [],
  };
  for (const p of todaySlate.picks) byCategory[p.category].push(p);
  // Sort each category by probability descending, status priority for ordering
  for (const cat of CATEGORIES) {
    byCategory[cat].sort((a, b) => {
      const rank = (p: ConvictionPick) =>
        p.result === 'live' ? 0 :
        p.result === 'pending' ? 1 :
        p.result === 'hit' ? 2 :
        p.result === 'miss' ? 3 : 4;
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return b.probability - a.probability;
    });
  }

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
            <span>{todaySlate.picks.length} picks at &gt; 60% model probability</span>
            <span className="px-1 text-ink-faint">·</span>
            <AutoRefresh intervalMs={60_000} label="auto-refresh 60s" />
          </p>
        </div>
        <DateNav today={today} />
      </div>

      {/* TODAY'S SCORECARD */}
      <Panel
        title="Today's scorecard"
        subtitle={`All > 60% model picks · 5 buckets · ${todayAgg.total} total picks across ${todaySlate.games} games`}
        flush
      >
        <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-line">
          <BigTile label="Total picks" value={todayAgg.total.toString()} />
          <BigTile label="Hits" value={todayAgg.hits.toString()} accent="pos" />
          <BigTile label="Misses" value={todayAgg.misses.toString()} accent="neg" />
          <BigTile
            label="Win %"
            value={todayAgg.hits + todayAgg.misses > 0 ? `${(todayAgg.hitRate * 100).toFixed(1)}%` : '—'}
            accent={todayAgg.hitRate > 0.55 ? 'pos' : todayAgg.hitRate < 0.45 && (todayAgg.hits + todayAgg.misses) > 0 ? 'neg' : undefined}
            big
          />
          <BigTile
            label="Units"
            value={todayAgg.units >= 0 ? `+${todayAgg.units.toFixed(1)}` : todayAgg.units.toFixed(1)}
            accent={todayAgg.units > 0 ? 'pos' : todayAgg.units < 0 ? 'neg' : undefined}
            sub="−110 juice assumed"
          />
          <BigTile
            label="Open"
            value={(todayAgg.live + todayAgg.pending).toString()}
            sub={`${todayAgg.live} live · ${todayAgg.pending} pre-game`}
          />
        </div>

        {/* Per-category mini scoreboard */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-line border-t border-line">
          {CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const picks = byCategory[cat];
            const agg = aggregatePicks(picks);
            const Icon = meta.icon;
            return (
              <div key={cat} className="bg-bg-panel p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon size={12} className={meta.color} />
                  <span className="text-2xs uppercase tracking-micro font-bold text-ink">{meta.label}</span>
                </div>
                <div className="stat-num text-lg font-black text-ink">
                  {agg.hits}<span className="text-ink-faint">-</span>{agg.misses}
                  {(agg.live + agg.pending) > 0 && (
                    <span className="text-2xs text-ink-faint font-normal ml-1">+{agg.live + agg.pending} open</span>
                  )}
                </div>
                <div className="text-2xs text-ink-muted stat-num">
                  {agg.hits + agg.misses > 0 ? `${(agg.hitRate * 100).toFixed(1)}%` : `${picks.length} picks`}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* 7-DAY HISTORY */}
      <Panel
        title="Last 7 days"
        subtitle={`${weekTotal.hits}–${weekTotal.misses} (${weekDecided > 0 ? `${(weekHitRate * 100).toFixed(1)}%` : '—'}) · ${weekTotal.units >= 0 ? '+' : ''}${weekTotal.units.toFixed(1)}u across the week`}
        flush
      >
        <div className="grid grid-cols-7 divide-x divide-line">
          {weekAggs.map((agg) => {
            const isToday = agg.date === today;
            const cls =
              agg.units > 0.5 ? 'border-t-signal-pos' :
              agg.units < -0.5 ? 'border-t-signal-neg' :
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
                  {agg.hits + agg.misses > 0 ? `${(agg.hitRate * 100).toFixed(0)}%` : agg.total > 0 ? `${agg.total} picks` : '—'}
                </div>
                <div className={`text-2xs stat-num mt-0.5 ${agg.units > 0 ? 'text-signal-pos' : agg.units < 0 ? 'text-signal-neg' : 'text-ink-faint'}`}>
                  {agg.units >= 0 ? '+' : ''}{agg.units.toFixed(1)}u
                </div>
              </Link>
            );
          })}
        </div>
      </Panel>

      {/* CATEGORY PICKS — one panel per category */}
      {todaySlate.picks.length === 0 ? (
        <Panel>
          <Empty
            title="No > 60% picks on today's slate"
            description="The model didn't find any single-side probability above 60% in any of the five buckets for the games on this date."
            icon={<Activity size={28} />}
          />
        </Panel>
      ) : (
        CATEGORIES.map((cat) => {
          const picks = byCategory[cat];
          if (picks.length === 0) return null;
          const meta = CATEGORY_META[cat];
          const agg = aggregatePicks(picks);
          const Icon = meta.icon;
          return (
            <Panel
              key={cat}
              title={
                <span className="flex items-center gap-2">
                  <Icon size={16} className={meta.color} />
                  {meta.label}
                  <span className="text-2xs px-1.5 py-0.5 rounded border border-line bg-bg-raised text-ink-muted stat-num">
                    {agg.hits}–{agg.misses}{(agg.live + agg.pending) > 0 ? ` · +${agg.live + agg.pending}` : ''}
                  </span>
                </span>
              }
              subtitle={meta.sublabel}
              flush
            >
              <ul className="divide-y divide-line-subtle">
                {picks.map((p, i) => (
                  <PickRow key={`${p.gamePk}-${p.category}-${i}`} pick={p} />
                ))}
              </ul>
            </Panel>
          );
        })
      )}

      {/* Methodology footer */}
      <Panel title="Methodology">
        <ul className="text-sm text-ink-muted space-y-2 list-disc pl-5">
          <li>
            <span className="text-ink">Five categories tracked</span>: Winner ML, pitcher strikeouts (over-line),
            F5 over/under, NRFI/YRFI, full-game total over/under. Every pick is logged the moment the slate is
            generated, before first pitch.
          </li>
          <li>
            <span className="text-ink">Only &gt; 60% picks make this page.</span> If the model isn't at least 60%
            on a side, no pick is recorded — keeps the bar high and the receipts tight.
          </li>
          <li>
            <span className="text-ink">Win % = hits / (hits + misses).</span> Pushes, pending, and live picks
            are tracked separately. Units assume −110 juice (+1.00 per win, −1.10 per loss).
          </li>
          <li>
            <span className="text-ink">K props use Poisson(λ)</span> where λ = projected starter Ks (K/9 ×
            IP/start × opp adj × park SO factor). Run totals use normal-approx with overdispersion ψ=1.5.
            F5 + NRFI come from the F5 model. Full math at <Link href="/lab" className="underline">/lab</Link>.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function PickRow({ pick }: { pick: ConvictionPick }) {
  const resultIcon =
    pick.result === 'hit' ? <CheckCircle2 size={20} className="text-signal-pos" /> :
    pick.result === 'miss' ? <XCircle size={20} className="text-signal-neg" /> :
    pick.result === 'live' ? <Activity size={20} className="text-signal-neg animate-pulse" /> :
    pick.result === 'no-grade' ? <Circle size={20} className="text-ink-faint" /> :
    <Circle size={20} className="text-ink-faint" />;

  const resultLabel =
    pick.result === 'hit' ? 'HIT' :
    pick.result === 'miss' ? 'MISS' :
    pick.result === 'live' ? 'LIVE' :
    pick.result === 'no-grade' ? 'N/A' :
    'PENDING';

  const resultCls =
    pick.result === 'hit' ? 'border-signal-pos/40 bg-signal-pos/10 text-signal-pos' :
    pick.result === 'miss' ? 'border-signal-neg/40 bg-signal-neg/10 text-signal-neg' :
    pick.result === 'live' ? 'border-signal-neg/40 bg-signal-neg/10 text-signal-neg' :
    'border-line bg-bg-raised text-ink-muted';

  const accentBorder =
    pick.result === 'hit' ? 'border-l-signal-pos' :
    pick.result === 'miss' ? 'border-l-signal-neg' :
    pick.result === 'live' ? 'border-l-signal-neg' :
    'border-l-transparent';

  return (
    <li className={`border-l-2 ${accentBorder}`}>
      <Link href={`/game/${pick.gamePk}`} className="block px-4 py-3 hover:bg-bg-hover/40 transition-colors">
        <div className="grid grid-cols-[36px_auto_1fr_auto] gap-3 items-start">
          {/* Result icon column */}
          <div className="flex flex-col items-center gap-1">
            {resultIcon}
            <span className={`text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded border ${resultCls}`}>
              {resultLabel}
            </span>
          </div>

          {/* Side / line column */}
          <div className="flex flex-col items-start gap-0.5 min-w-[110px]">
            <span className="text-base font-black text-ink stat-num leading-none">{pick.side}</span>
            <span className="text-2xs text-ink-faint stat-num">{pick.gameLabel}</span>
          </div>

          {/* Body column */}
          <div className="min-w-0">
            <div className="text-sm text-ink leading-snug">
              {pick.playerName && (
                <span className="font-semibold mr-1">{pick.playerName}</span>
              )}
              <span className="text-ink-muted">{pick.prediction.replace(`${pick.playerName} `, '')}</span>
            </div>
            {pick.actualText && (
              <div className={`text-2xs mt-1 stat-num ${
                pick.result === 'hit' ? 'text-signal-pos' :
                pick.result === 'miss' ? 'text-signal-neg' :
                pick.result === 'live' ? 'text-signal-neg' :
                'text-ink-muted'
              }`}>
                <span className="label-micro mr-1">Actual</span>
                <span className="font-semibold">{pick.actualText}</span>
              </div>
            )}
          </div>

          {/* Probability column */}
          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
            <div className="flex items-baseline gap-1">
              <span className={`stat-num text-2xl font-black ${
                pick.probability >= 0.75 ? 'text-signal-pos' :
                pick.probability >= 0.65 ? 'text-ink' :
                'text-ink-muted'
              }`}>{(pick.probability * 100).toFixed(0)}</span>
              <span className="text-2xs text-ink-faint">%</span>
            </div>
            {(pick.result === 'live' || pick.result === 'pending') && (
              <span className="text-2xs text-ink-faint">
                <LocalTime iso={pick.firstPitch} format="time" />
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function BigTile({
  label,
  value,
  sub,
  accent,
  big = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'pos' | 'neg';
  big?: boolean;
}) {
  const cls = accent === 'pos' ? 'text-signal-pos' : accent === 'neg' ? 'text-signal-neg' : 'text-ink';
  return (
    <div className="bg-bg-panel p-4">
      <div className="label-micro mb-1.5">{label}</div>
      <div className={`stat-num ${big ? 'text-3xl' : 'text-2xl'} font-black ${cls}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-faint mt-1 truncate">{sub}</div>}
    </div>
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
  const dt = new Date(`${date}T12:00:00Z`);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
