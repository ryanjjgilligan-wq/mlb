import Link from 'next/link';
import { buildSlateInsights, type Opportunity } from '@/lib/insights';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LocalDate } from '@/components/LocalDate';
import { LocalTime } from '@/components/LocalTime';
import { Countdown } from '@/components/Countdown';
import { ymd, shiftYmd } from '@/lib/time';
import { Sparkles, TrendingUp, TrendingDown, CloudRain, Zap, AlertTriangle, MapPin, Plane, Flame } from 'lucide-react';

export const revalidate = 600;
export const metadata = {
  title: 'Opportunities',
  description: 'Notable stats and edges across today\'s MLB slate.',
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: { date?: string } }) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : ymd();
  const { games, opportunities } = await buildSlateInsights(today);

  // Group opportunities by category
  const byCategory: Record<Opportunity['category'], Opportunity[]> = {
    shootout: [],
    'total-high': [],
    'total-low': [],
    weather: [],
    'k-matchup': [],
    park: [],
    mismatch: [],
    travel: [],
  };
  for (const o of opportunities) byCategory[o.category].push(o);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles size={20} className="text-accent" />
            Opportunities
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            <LocalDate ymd={today} className="stat-num" />
            <span className="px-1 text-ink-faint">·</span>
            <span>{games.length} preview games on the slate</span>
            <span className="px-1 text-ink-faint">·</span>
            <span>{opportunities.length} notable edges</span>
            {games.length > 0 && (
              <>
                <span className="px-1 text-ink-faint">·</span>
                <AutoRefresh intervalMs={300_000} label="auto-refresh 5m" />
              </>
            )}
          </p>
        </div>
        <DateNav today={today} />
      </div>

      {games.length === 0 ? (
        <Panel>
          <Empty
            title="No preview games for this date."
            description="Pick another date above, or check back closer to first pitch."
            icon={<Sparkles size={28} />}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CategoryPanel
            title="Shootout watch"
            subtitle="Park factor × weather both lifting offense"
            icon={<Flame size={14} className="text-signal-neg" />}
            opportunities={byCategory.shootout}
            variant="neg"
          />
          <CategoryPanel
            title="Highest projected totals"
            subtitle="Run-total predictor leaders"
            icon={<TrendingUp size={14} className="text-signal-pos" />}
            opportunities={byCategory['total-high']}
            variant="pos"
          />
          <CategoryPanel
            title="Lowest projected totals"
            subtitle="Pitcher-friendly setups"
            icon={<TrendingDown size={14} className="text-signal-info" />}
            opportunities={byCategory['total-low']}
            variant="info"
          />
          <CategoryPanel
            title="Weather impact"
            subtitle="Conditions moving the model most"
            icon={<CloudRain size={14} className="text-signal-info" />}
            opportunities={byCategory.weather}
            variant="info"
          />
          <CategoryPanel
            title="K matchups"
            subtitle="Elite K starters on the bump"
            icon={<Zap size={14} className="text-accent" />}
            opportunities={byCategory['k-matchup']}
            variant="accent"
          />
          <CategoryPanel
            title="Park amplifications"
            subtitle="Extreme hitter or pitcher venues"
            icon={<MapPin size={14} className="text-ink-muted" />}
            opportunities={byCategory.park}
            variant="neutral"
          />
          <CategoryPanel
            title="Talent mismatches"
            subtitle="Model sees a sizable gap"
            icon={<AlertTriangle size={14} className="text-signal-warn" />}
            opportunities={byCategory.mismatch}
            variant="warn"
          />
          <CategoryPanel
            title="Long road trips"
            subtitle="Visitor traveled significant miles"
            icon={<Plane size={14} className="text-ink-muted" />}
            opportunities={byCategory.travel}
            variant="neutral"
          />
        </div>
      )}

      {games.length > 0 && (
        <Panel
          title={`All preview games — ${games.length}`}
          subtitle="Full slate with first-pitch countdown · click any game for full prediction detail"
          flush
        >
          <ul className="divide-y divide-line-subtle">
            {games
              .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
              .map((g) => (
                <li key={g.gamePk}>
                  <Link href={`/game/${g.gamePk}`} className="grid grid-cols-[100px_1fr_auto_auto] items-center gap-3 px-3 py-2 row-hover">
                    <div className="flex flex-col">
                      <LocalDate ymd={g.gameDate.slice(0, 10)} className="text-2xs text-ink-faint stat-num" />
                      <LocalTime iso={g.gameDate} format="time" className="text-2xs text-ink-muted stat-num" />
                      <Countdown iso={g.gameDate} status="Preview" />
                    </div>
                    <div className="text-sm">
                      <span className="text-ink-muted">{g.away.name}</span>
                      <span className="text-ink-faint mx-2">@</span>
                      <span className="text-ink">{g.home.name}</span>
                      <span className="text-2xs text-ink-faint ml-2">{g.venueName}</span>
                    </div>
                    <div className="text-right">
                      <div className="label-micro">xR</div>
                      <div className="stat-num text-sm text-ink">{g.prediction.expectedTotal.toFixed(1)}</div>
                    </div>
                    <div className="text-right">
                      <div className="label-micro">Home WP</div>
                      <div className="stat-num text-sm text-ink">{(g.prediction.pHomeWin * 100).toFixed(0)}%</div>
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function CategoryPanel({
  title,
  subtitle,
  icon,
  opportunities,
  variant,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  opportunities: Opportunity[];
  variant: 'pos' | 'neg' | 'info' | 'warn' | 'accent' | 'neutral';
}) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
      }
      subtitle={subtitle}
      flush
    >
      {opportunities.length === 0 ? (
        <div className="px-3 py-6 text-2xs text-ink-faint text-center">Nothing notable in this category today.</div>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {opportunities.map((o, i) => (
            <li key={`${o.category}-${o.gamePk}-${i}`}>
              <Link href={`/game/${o.gamePk}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                <Badge variant={variant} className="shrink-0 stat-num">{o.metric}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink truncate">{o.headline}</div>
                  <div className="text-2xs text-ink-faint truncate">{o.subline}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-2xs text-ink-faint stat-num">{o.gameLabel}</span>
                  <ConfidencePill level={o.confidence} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ConfidencePill({ level }: { level: 'low' | 'medium' | 'high' }) {
  const cls =
    level === 'high'
      ? 'border-signal-pos/40 text-signal-pos'
      : level === 'medium'
      ? 'border-signal-info/40 text-signal-info'
      : 'border-line text-ink-muted';
  return (
    <span className={`inline-flex items-center gap-1 px-1 py-0 rounded border text-[9px] uppercase tracking-micro ${cls}`}>
      {level} conf.
    </span>
  );
}

function DateNav({ today }: { today: string }) {
  const yesterday = shiftYmd(today, -1);
  const tomorrow = shiftYmd(today, 1);
  return (
    <div className="flex items-center gap-1 text-2xs">
      <Link href={`/opportunities?date=${yesterday}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">‹</Link>
      <span className="text-ink-muted px-1 stat-num">{today === ymd() ? 'TODAY' : today}</span>
      <Link href={`/opportunities?date=${tomorrow}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">›</Link>
    </div>
  );
}
