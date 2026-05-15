import Link from 'next/link';
import { buildSlateInsights, type Opportunity } from '@/lib/insights';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { Tooltip } from '@/components/ui/Tooltip';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LocalDate } from '@/components/LocalDate';
import { LocalTime } from '@/components/LocalTime';
import { Countdown } from '@/components/Countdown';
import { ymd, shiftYmd } from '@/lib/time';
import { Sparkles, TrendingUp, TrendingDown, CloudRain, Zap, AlertTriangle, MapPin, Plane, Flame, ChevronRight, Info } from 'lucide-react';

export const revalidate = 600;
export const metadata = {
  title: 'Opportunities',
  description: "Notable stats and edges across today's MLB slate, explained.",
};

const META: Record<Opportunity['category'], { label: string; sublabel: string; icon: any; color: string; chip: 'pos'|'neg'|'warn'|'info'|'accent'|'neutral' }> = {
  shootout:    { label: 'Shootout setup',     sublabel: 'Park × weather stacking',          icon: Flame,           color: 'text-signal-neg',  chip: 'neg' },
  'total-high':{ label: 'High-total game',    sublabel: 'Run total well above slate median', icon: TrendingUp,      color: 'text-signal-pos',  chip: 'pos' },
  'total-low': { label: 'Pitchers\' duel',    sublabel: 'Run total well below slate median', icon: TrendingDown,    color: 'text-signal-info', chip: 'info' },
  weather:     { label: 'Weather impact',     sublabel: 'Conditions moving the model ≥5%',   icon: CloudRain,       color: 'text-signal-info', chip: 'info' },
  'k-matchup': { label: 'Elite K matchup',    sublabel: 'Starter K/9 ≥ 11',                 icon: Zap,             color: 'text-accent',      chip: 'accent' },
  park:        { label: 'Park amplification', sublabel: 'Extreme hitter or pitcher venue',   icon: MapPin,          color: 'text-ink-muted',   chip: 'neutral' },
  mismatch:    { label: 'Talent mismatch',    sublabel: 'Win prob > 70% one side',           icon: AlertTriangle,   color: 'text-signal-warn', chip: 'warn' },
  travel:      { label: 'Long road trip',     sublabel: 'Visitor traveled ≥ 2000 mi',        icon: Plane,           color: 'text-ink-muted',   chip: 'neutral' },
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: { date?: string } }) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : ymd();
  const { games, opportunities } = await buildSlateInsights(today);

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-6 space-y-6">
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
            <span>{games.length} preview games</span>
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

      {/* Method primer — explains what this page is and how to read it */}
      <Panel
        title={<span className="flex items-center gap-2"><Info size={14} className="text-signal-info" /> How to read this page</span>}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-ink-muted">
          <div>
            <div className="label-micro mb-1">What's an opportunity?</div>
            Each card flags a game where a model input is meaningfully different from average — the
            run environment is well above or below median, weather is helping or hurting offense,
            an elite K starter is on the bump, etc. Only edges past calibrated thresholds are listed.
          </div>
          <div>
            <div className="label-micro mb-1">Confidence score</div>
            A 0–100 number with a high/medium label. It's higher when key inputs (starter FIP,
            weather, opponent rates) are present, the talent gap is clear, and the prediction's
            confidence interval is tight. Only medium-or-higher edges show here.
          </div>
          <div>
            <div className="label-micro mb-1">For analytical use only</div>
            These projections come from a transparent Log5/Poisson baseline with documented
            modifiers — not a trained ML model. Click into any game for the full modifier ledger.
            <span className="block mt-1 text-ink-faint">Not betting advice.</span>
          </div>
        </div>
      </Panel>

      {games.length === 0 ? (
        <Panel>
          <Empty
            title="No preview games for this date."
            description="Pick another date above, or check back closer to first pitch."
            icon={<Sparkles size={28} />}
          />
        </Panel>
      ) : opportunities.length === 0 ? (
        <Panel>
          <Empty
            title="No standout edges on today's slate."
            description="Every preview game is within typical model bounds. Check back later as conditions update, or open the full slate below."
            icon={<Info size={28} />}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {opportunities.map((o, i) => (
            <OpportunityCard key={`${o.category}-${o.gamePk}-${i}`} opp={o} rank={i + 1} />
          ))}
        </div>
      )}

      {games.length > 0 && (
        <Panel
          title={`Full slate · ${games.length} preview games`}
          subtitle="Date · time · countdown · expected total · home win % · venue"
          flush
        >
          <ul className="divide-y divide-line-subtle">
            {games
              .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
              .map((g) => (
                <li key={g.gamePk}>
                  <Link href={`/game/${g.gamePk}`} className="grid grid-cols-[100px_1fr_auto_auto_auto] items-center gap-3 px-3 py-2 row-hover">
                    <div className="flex flex-col">
                      <LocalDate ymd={g.gameDate.slice(0, 10)} className="text-2xs text-ink-faint stat-num" />
                      <LocalTime iso={g.gameDate} format="time" className="text-2xs text-ink-muted stat-num" />
                      <Countdown iso={g.gameDate} status="Preview" />
                    </div>
                    <div className="text-sm min-w-0">
                      <span className="text-ink-muted">{g.away.name}</span>
                      <span className="text-ink-faint mx-2">@</span>
                      <span className="text-ink">{g.home.name}</span>
                      <span className="text-2xs text-ink-faint ml-2 truncate">{g.venueName}</span>
                    </div>
                    <div className="text-right w-12">
                      <div className="label-micro">xR</div>
                      <div className="stat-num text-sm text-ink">{g.prediction.expectedTotal.toFixed(1)}</div>
                    </div>
                    <div className="text-right w-14">
                      <div className="label-micro">Home WP</div>
                      <div className="stat-num text-sm text-ink">{(g.prediction.pHomeWin * 100).toFixed(0)}%</div>
                    </div>
                    <ChevronRight size={14} className="text-ink-faint" />
                  </Link>
                </li>
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function OpportunityCard({ opp, rank }: { opp: Opportunity; rank: number }) {
  const meta = META[opp.category];
  const Icon = meta.icon;
  const conf = opp.confidenceScore;
  return (
    <article className="panel overflow-hidden">
      {/* Header strip */}
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line bg-bg-raised">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xs text-ink-faint stat-num w-6">#{rank}</span>
          <Icon size={14} className={meta.color} />
          <span className="text-2xs uppercase tracking-micro font-medium text-ink">{meta.label}</span>
          <span className="text-2xs text-ink-faint truncate hidden md:inline">· {meta.sublabel}</span>
        </div>
        <Badge variant={meta.chip} className="shrink-0 stat-num">{opp.metric}</Badge>
      </header>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-ink leading-snug">{opp.headline}</h3>
          <p className="text-2xs text-ink-faint mt-1">{opp.subline}</p>
        </div>

        <div className="text-sm text-ink-muted leading-relaxed">{opp.explanation}</div>

        {/* Prediction line */}
        <div className="flex items-baseline justify-between gap-3 pt-1 pb-1 border-y border-line-subtle">
          <span className="label-micro">Model says</span>
          <span className="text-sm text-ink stat-num">{opp.prediction}</span>
        </div>

        {/* Confidence bar */}
        <div>
          <div className="flex items-center justify-between text-2xs mb-1">
            <span className="label-micro">Confidence</span>
            <span className={`stat-num font-medium ${
              opp.confidence === 'high' ? 'text-signal-pos' : 'text-signal-info'
            }`}>
              {opp.confidence.toUpperCase()} · {conf}/100
            </span>
          </div>
          <div className="h-1.5 rounded overflow-hidden bg-bg-sunken">
            <div
              className={`h-full rounded ${opp.confidence === 'high' ? 'bg-signal-pos' : 'bg-signal-info'}`}
              style={{ width: `${conf}%` }}
            />
          </div>
          {opp.confidenceReasons.length > 0 && (
            <Tooltip
              content={
                <span>
                  Confidence drivers:
                  <br />· {opp.confidenceReasons.slice(0, 6).join('\n· ')}
                </span>
              }
            >
              <span className="text-2xs text-ink-faint mt-1 inline-flex items-center gap-1 cursor-help border-b border-dotted border-line-strong">
                <Info size={10} /> why this score
              </span>
            </Tooltip>
          )}
        </div>

        {/* Footer with game link + first pitch */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-2xs text-ink-faint flex items-center gap-2">
            <span className="stat-num text-ink-muted">{opp.gameLabel}</span>
            <span>·</span>
            <LocalDate ymd={opp.firstPitch.slice(0, 10)} className="stat-num" />
            <span>·</span>
            <LocalTime iso={opp.firstPitch} format="time" className="stat-num" />
            <Countdown iso={opp.firstPitch} status="Preview" prefix="· in " />
          </div>
          <Link
            href={`/game/${opp.gamePk}`}
            className="text-2xs text-ink-muted hover:text-ink uppercase tracking-micro flex items-center gap-1"
          >
            Open game <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </article>
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
