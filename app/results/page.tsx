import Link from 'next/link';
import { buildSlateInsights } from '@/lib/insights';
import {
  buildAllPicks,
  aggregatePicks,
  topLocks,
  fairAmericanOdds,
  formatAmericanOdds,
  fairUnitPayout,
  payoutAtOdds,
  CATEGORY_THRESHOLDS,
  type ConvictionPick,
  type PickCategory,
} from '@/lib/highConvictionPicks';
import { getMarketOdds, isOddsConfigured } from '@/lib/odds';
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
  Scale,
  AlertTriangle,
} from 'lucide-react';

export const revalidate = 60;
export const metadata = {
  title: 'Results',
  description: 'Model predictions vs actual results — winners, K props, F5, NRFI/YRFI, run totals.',
};

const CATEGORY_META: Record<PickCategory, { label: string; sublabel: string; icon: any; color: string }> = {
  winner:       { label: 'Winners',       sublabel: 'Moneyline picks',                        icon: Crown,     color: 'text-accent' },
  'pitcher-k':  { label: 'Pitcher Ks',    sublabel: 'Strikeout over-line props',              icon: Zap,        color: 'text-signal-info' },
  f5:           { label: 'First 5',       sublabel: 'F5 over/under',                          icon: Hourglass,  color: 'text-signal-info' },
  'nrfi-yrfi':  { label: 'NRFI / YRFI',   sublabel: '1st-inning runs',                        icon: Shield,     color: 'text-signal-pos' },
  'total-runs': { label: 'Total runs',    sublabel: 'Full-game over/under',                   icon: BarChart3,  color: 'text-signal-info' },
  'run-line':   { label: 'Run line',      sublabel: '±1.5 spread covers',                     icon: Scale,      color: 'text-accent' },
};

const CATEGORIES: PickCategory[] = ['winner', 'pitcher-k', 'f5', 'nrfi-yrfi', 'total-runs', 'run-line'];

export default async function ResultsPage({ searchParams }: { searchParams: { date?: string } }) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : ymd();

  // Pull live market odds for today (only) — historical picks for prior
  // days use the prob-mode threshold since we don't store odds snapshots yet.
  const oddsConfigured = isOddsConfigured();
  const marketOdds = oddsConfigured ? await getMarketOdds().catch(() => null) : null;

  // Last 7 days (selected date + 6 prior) in parallel
  const dates = Array.from({ length: 7 }, (_, i) => shiftYmd(today, -i)).reverse();
  const allSlates = await Promise.all(
    dates.map((d) =>
      buildSlateInsights(d)
        .then((s) => {
          // Only feed market odds to today's slate — past days didn't have
          // these odds snapshotted, so we can't reliably tie them to picks
          // that would have existed at first pitch.
          const odds = d === today ? marketOdds : null;
          return {
            date: d,
            picks: buildAllPicks(s.games, {
              // Sleep Well mode: high prob × strong EV × no model bugs.
              // Designed to minimize losing-day count by skipping days entirely
              // when no real edge exists.
              evThresholdPerUnit: 0.08,   // ≥ +8¢ per $1 risked
              minModelProb: 0.60,          // ≥ 60% calibrated model prob → high hit-rate bets
              marketOdds: odds,
              mode: odds ? 'edge' : 'prob',
              // No global threshold — let CATEGORY_THRESHOLDS apply per category
            }),
            games: s.games.length,
          };
        })
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
    'run-line': [],
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

  // Sleep Well plays — top 3 highest-EV picks (one per game) across categories.
  // Only shows live + pending picks; decided picks are receipts. Capped at 3 so
  // a single day's P&L isn't concentrated, and to keep the bar high (only the
  // most-profitable picks make it).
  const locks = todaySlate.date === today ? topLocks(todaySlate.picks, 3) : [];
  // Picks with market data attached — these are the "actionable" bets for Sleep Well.
  const marketBackedActionable = todaySlate.picks.filter(
    (p) => p.market && (p.result === 'pending' || p.result === 'live')
  );
  const isSitOutDay = todaySlate.date === today && marketBackedActionable.length === 0 && oddsConfigured;

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
            <span>{todaySlate.picks.length} picks at per-category model bars</span>
            <span className="px-1 text-ink-faint">·</span>
            <AutoRefresh intervalMs={60_000} label="auto-refresh 60s" />
          </p>
        </div>
        <DateNav today={today} />
      </div>

      {/* Live odds banner */}
      {!oddsConfigured && (
        <Panel
          title={<span className="flex items-center gap-2"><AlertTriangle size={14} className="text-signal-warn" /> Running in model-only mode</span>}
        >
          <div className="text-sm text-ink-muted space-y-2">
            <p>
              Running in <span className="text-ink">model-only mode</span> — no sportsbook odds wired in.
              Picks are filtered by <span className="text-ink">per-category probability bars</span> tuned
              to each market's natural baseline (ML 64% · run-line 58% · Ks 58% · F5 60% · NRFI 62% ·
              totals 60%), and ranked into <span className="text-ink">Locks of the Day</span> by how far
              each modelP exceeds its bar.
            </p>
            <p>
              Units are calculated at fair zero-vig odds derived from the model — what you'd earn at
              the model's own price. Real sportsbook lines are ~5% worse, so live P&amp;L will track
              slightly below these numbers. (Optional: set <code className="text-2xs bg-bg-sunken px-1 rounded">ODDS_API_KEY</code>{' '}
              env var to enable edge mode against real market lines.)
            </p>
          </div>
        </Panel>
      )}

      {oddsConfigured && marketOdds && marketOdds.size > 0 && (
        <Panel
          title={<span className="flex items-center gap-2"><Scale size={14} className="text-signal-pos" /> Edge mode active</span>}
        >
          <p className="text-sm text-ink-muted">
            <span className="text-ink">Sleep Well mode active</span>. Live sportsbook odds wired in for{' '}
            <span className="text-ink stat-num">{marketOdds.size}</span> games. Picks must clear ALL of:{' '}
            <span className="text-ink">model prob ≥ 60%</span> · <span className="text-ink">EV ≥ +8¢/unit</span>{' '}
            · <span className="text-ink">edge ≤ 10pp</span>, all after Brier-shrink calibration. Capped at the
            top 3 plays per day. The whole point: fewer losing days, even if it means betting less.
          </p>
        </Panel>
      )}

      {/* TODAY'S SCORECARD */}
      <Panel
        title="Today's scorecard"
        subtitle={oddsConfigured && marketOdds
          ? `Edge mode: > 3pp edge vs market · ${todayAgg.total} picks across ${todaySlate.games} games`
          : `Model-only mode: > 60% model probability · ${todayAgg.total} picks across ${todaySlate.games} games`}
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
            sub="at fair model odds"
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

      {/* SIT OUT DAY */}
      {isSitOutDay && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Crown size={16} className="text-ink-muted" />
              SIT OUT TODAY
              <span className="text-2xs px-1.5 py-0.5 rounded border border-line bg-bg-raised text-ink-muted stat-num font-bold">
                0 PLAYS
              </span>
            </span>
          }
          subtitle="No picks clear the Sleep Well bar today — the right move is no bet"
        >
          <div className="text-sm text-ink-muted space-y-2">
            <p>
              Across today's <span className="text-ink stat-num">{todaySlate.games}</span> games, no side cleared
              the Sleep Well filter: <span className="text-ink">model probability ≥ 60%</span> AND{' '}
              <span className="text-ink">EV ≥ +8¢/unit</span> AND <span className="text-ink">edge ≤ 10pp</span>{' '}
              after Brier-shrink calibration.
            </p>
            <p>
              A skipped day is mathematically a 0-unit day — not a loss. This is the single biggest lever for
              minimizing losing days. Check back tomorrow.
            </p>
          </div>
        </Panel>
      )}

      {/* SLEEP WELL PLAYS */}
      {locks.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Crown size={16} className="text-accent" />
              Plays of the Day
              <span className="text-2xs px-1.5 py-0.5 rounded border border-accent/30 bg-accent/10 text-accent stat-num font-bold">
                {locks.length} {locks.length === 1 ? 'PLAY' : 'PLAYS'}
              </span>
            </span>
          }
          subtitle="Sleep Well mode: highest-EV picks (≥ +8¢/unit, ≥ 60% calibrated prob) — at most one per game"
          flush
        >
          <ul className="divide-y divide-line-subtle">
            {locks.map((p, i) => (
              <LockRow key={`lock-${p.gamePk}-${p.category}`} pick={p} rank={i + 1} />
            ))}
          </ul>
        </Panel>
      )}

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
            title="No qualifying picks on today's slate"
            description="The model didn't find any side meeting the per-category conviction bars (ML 64%, run-line 58%, Ks 58%, F5 60%, NRFI 62%, totals 60%) for the games on this date."
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
            <span className="text-ink">Six categories tracked</span>: Winner ML, run-line (±1.5), pitcher
            strikeouts (over-line), F5 over/under, NRFI/YRFI, full-game total over/under. Every pick is logged
            the moment the slate is generated, before first pitch.
          </li>
          <li>
            <span className="text-ink">Sleep Well mode</span> (default when{' '}
            <code className="stat-num">ODDS_API_KEY</code> is set): a pick must clear ALL of{' '}
            <span className="stat-num">≥ 60% calibrated prob</span>,{' '}
            <span className="stat-num">≥ +8¢/unit EV</span>, and{' '}
            <span className="stat-num">≤ 10pp edge</span> (above is model bug, not opportunity). Designed to
            minimize losing-day count by surfacing only high-hit-rate × profitable bets — when nothing qualifies,
            the page shows <span className="text-ink">SIT OUT TODAY</span>, which is mathematically a 0-unit day
            (not a loss). At −150 you need 60% to break even, at +120 only 45.5% — filtering on EV instead of
            raw edge drops thin edges on heavy favorites where the price is too short.
            <span className="text-ink"> Prob mode</span> (model-only fallback) accepts a side at the
            category's natural bar — different categories have different "easy" baselines, so a single
            60% threshold treats a coin-flip win as equal to a hard NRFI prediction. Per-category
            bars: <span className="stat-num">ML 64%</span> · <span className="stat-num">run-line 58%</span> ·{' '}
            <span className="stat-num">Ks 58%</span> · <span className="stat-num">F5 60%</span> ·{' '}
            <span className="stat-num">NRFI 62%</span> · <span className="stat-num">totals 60%</span>.
          </li>
          <li>
            <span className="text-ink">Plays of the Day</span> surfaces the top 3 highest-EV picks
            of the slate, ranked by expected value per unit. At most one pick per game so the day's
            P&amp;L isn't concentrated on a single matchup. Falls back to conviction rank when no
            market data is available for a category.
          </li>
          <li>
            <span className="text-ink">Win % = hits / (hits + misses).</span> Pushes, pending, and live picks
            are tracked separately.
          </li>
          <li>
            <span className="text-ink">Units</span>: when live market odds are attached we calculate P&amp;L at
            the real American line (the price you'd actually get at a US book — median across surveyed books).
            When odds aren't available we fall back to fair (zero-vig) odds derived from the model's
            probability: a 70% pick wins 0.43u, a 60% pick wins 0.67u, both lose 1.00u. The fair-units
            number always tracks what you'd earn at the model's own price.
          </li>
          <li>
            <span className="text-ink">K props use Poisson(λ)</span> where λ = projected starter Ks (K/9 ×
            IP/start × opp adj × park SO factor). Run totals + run-line use normal-approx with overdispersion
            ψ=1.5 on (home − away) run differential. F5 + NRFI come from the F5 model. Full math at{' '}
            <Link href="/lab" className="underline">/lab</Link>.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function LockRow({ pick, rank }: { pick: ConvictionPick; rank: number }) {
  const meta = CATEGORY_META[pick.category];
  const Icon = meta.icon;
  const bar = CATEGORY_THRESHOLDS[pick.category];
  const convictionPP = pick.conviction * 100;
  const isLive = pick.result === 'live';

  // Rank badge color: gold #1, silver #2, bronze #3, line for rest
  const rankCls =
    rank === 1 ? 'bg-accent text-bg border-accent' :
    rank === 2 ? 'bg-ink-muted text-bg border-ink-muted' :
    rank === 3 ? 'bg-signal-warn/80 text-bg border-signal-warn' :
    'bg-bg-raised text-ink-muted border-line';

  return (
    <li className={`border-l-2 ${rank === 1 ? 'border-l-accent' : 'border-l-transparent'}`}>
      <Link href={`/game/${pick.gamePk}`} className="block px-4 py-3 hover:bg-bg-hover/40 transition-colors">
        <div className="grid grid-cols-[28px_auto_1fr_auto] gap-3 items-center">
          {/* Rank badge */}
          <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm font-black stat-num ${rankCls}`}>
            {rank}
          </div>

          {/* Side + game */}
          <div className="flex flex-col items-start gap-0.5 min-w-[110px]">
            <span className="text-base font-black text-ink stat-num leading-none">{pick.side}</span>
            <div className="flex items-center gap-1">
              <Icon size={10} className={meta.color} />
              <span className="text-2xs text-ink-faint stat-num">{pick.gameLabel}</span>
            </div>
          </div>

          {/* Body */}
          <div className="min-w-0">
            <div className="text-sm text-ink leading-snug">
              {pick.playerName && <span className="font-semibold mr-1">{pick.playerName}</span>}
              <span className="text-ink-muted">{pick.prediction.replace(`${pick.playerName} `, '')}</span>
            </div>
            <div className="text-2xs text-ink-faint mt-0.5">
              {pick.market ? (
                <>
                  <span className="label-micro mr-1">EV per unit</span>
                  <span className={`stat-num font-bold ${pick.market.evPerUnit >= 0.10 ? 'text-signal-pos' : 'text-signal-pos/80'}`}>
                    {pick.market.evPerUnit >= 0 ? '+' : ''}{(pick.market.evPerUnit * 100).toFixed(1)}¢
                  </span>
                  <span className="text-ink-faint mx-1">·</span>
                  <span className="stat-num">+{pick.market.edgePP.toFixed(1)}pp edge</span>
                  <span className="text-ink-faint mx-1">·</span>
                  <span className="stat-num">breakeven {(pick.market.impliedProb * 100).toFixed(1)}%</span>
                </>
              ) : (
                <>
                  <span className="label-micro mr-1">{meta.label} bar</span>
                  <span className="stat-num">{(bar * 100).toFixed(0)}%</span>
                  <span className="text-ink-faint mx-1">·</span>
                  <span className="stat-num text-ink-muted">+{convictionPP.toFixed(1)}pp over bar</span>
                  <span className="text-ink-faint mx-1">·</span>
                  <span className="stat-num text-ink-faint">no market data</span>
                </>
              )}
              {isLive && (
                <>
                  <span className="text-ink-faint mx-1">·</span>
                  <span className="text-signal-neg font-semibold">LIVE NOW</span>
                </>
              )}
            </div>
          </div>

          {/* Probability + price */}
          <div className="text-right shrink-0 flex flex-col items-end gap-0.5 min-w-[110px]">
            <div className="flex items-baseline gap-1">
              <span className={`stat-num text-2xl font-black ${
                pick.probability >= 0.75 ? 'text-signal-pos' :
                pick.probability >= 0.65 ? 'text-ink' :
                'text-ink'
              }`}>{(pick.probability * 100).toFixed(0)}</span>
              <span className="text-2xs text-ink-faint">% model</span>
            </div>
            {pick.market ? (
              <div className={`text-2xs stat-num font-semibold ${
                pick.market.edgePP >= 5 ? 'text-signal-pos' :
                pick.market.edgePP >= 3 ? 'text-signal-pos/80' :
                'text-ink-muted'
              }`}>
                {formatAmericanOdds(pick.market.americanOdds)} · +{pick.market.edgePP.toFixed(1)}pp edge
              </div>
            ) : (
              <div className="text-2xs text-ink-faint stat-num">
                fair {formatAmericanOdds(fairAmericanOdds(pick.probability))}
              </div>
            )}
            <span className="text-2xs text-ink-faint">
              <LocalTime iso={pick.firstPitch} format="time" />
            </span>
          </div>
        </div>
      </Link>
    </li>
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

          {/* Probability + market + edge column */}
          <div className="text-right shrink-0 flex flex-col items-end gap-0.5 min-w-[120px]">
            <div className="flex items-baseline gap-1">
              <span className={`stat-num text-2xl font-black ${
                pick.probability >= 0.75 ? 'text-signal-pos' :
                pick.probability >= 0.65 ? 'text-ink' :
                'text-ink-muted'
              }`}>{(pick.probability * 100).toFixed(0)}</span>
              <span className="text-2xs text-ink-faint">% model</span>
            </div>
            {pick.market ? (
              <>
                <div className="text-2xs text-ink-faint stat-num">
                  market {formatAmericanOdds(pick.market.americanOdds)} · {(pick.market.impliedProb * 100).toFixed(1)}%
                </div>
                <div className={`text-2xs stat-num font-semibold ${
                  pick.market.edgePP >= 5 ? 'text-signal-pos' :
                  pick.market.edgePP >= 3 ? 'text-signal-pos/80' :
                  pick.market.edgePP >= 0 ? 'text-ink-muted' :
                  'text-signal-neg'
                }`}>
                  edge {pick.market.edgePP >= 0 ? '+' : ''}{pick.market.edgePP.toFixed(1)}pp · EV {pick.market.evPerUnit >= 0 ? '+' : ''}{(pick.market.evPerUnit * 100).toFixed(1)}¢
                </div>
              </>
            ) : (
              <div className="text-2xs text-ink-faint stat-num">
                fair {formatAmericanOdds(fairAmericanOdds(pick.probability))}
              </div>
            )}
            {pick.result === 'hit' && (
              <div className="text-2xs text-signal-pos stat-num font-semibold">
                +{(pick.market ? payoutAtOdds(pick.market.americanOdds) : fairUnitPayout(pick.probability)).toFixed(2)}u
              </div>
            )}
            {pick.result === 'miss' && (
              <div className="text-2xs text-signal-neg stat-num font-semibold">−1.00u</div>
            )}
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
