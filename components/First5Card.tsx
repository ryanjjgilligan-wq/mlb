import Link from 'next/link';
import { Badge } from './ui/Badge';
import { LocalDate } from './LocalDate';
import { LocalTime } from './LocalTime';
import { Countdown } from './Countdown';
import { teamCapLogoUrl } from '@/lib/mlb';
import type { First5Output } from '@/lib/predict';

export type First5CardData = {
  gamePk: number;
  away: { id: number; name: string; abbr?: string };
  home: { id: number; name: string; abbr?: string };
  gameDate: string;
  venueName?: string;
  awayStarter?: { id: number; name: string };
  homeStarter?: { id: number; name: string };
  output: First5Output;
};

export function First5Card({ d }: { d: First5CardData }) {
  const o = d.output;
  return (
    <article className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-bg-raised">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="info">F5</Badge>
          <span className="text-2xs text-ink-faint stat-num">{d.gamePk}</span>
        </div>
        <div className="flex items-center gap-2 text-2xs text-ink-faint">
          <LocalDate ymd={d.gameDate.slice(0, 10)} className="stat-num" />
          <span>·</span>
          <LocalTime iso={d.gameDate} format="time" className="stat-num" />
          <Countdown iso={d.gameDate} status="Preview" prefix="· " />
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Score-style hero */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Link href={`/team/${d.away.id}`} className="flex items-center gap-2 min-w-0">
            <img src={teamCapLogoUrl(d.away.id)} alt="" className="w-6 h-6 team-logo opacity-90" />
            <span className="text-sm font-medium truncate">{d.away.abbr ?? d.away.name}</span>
          </Link>
          <div className="text-center">
            <div className="label-micro">F5 totals</div>
            <div className="stat-num text-2xl font-semibold mt-0.5">
              {o.expectedAwayRuns.toFixed(2)}–{o.expectedHomeRuns.toFixed(2)}
            </div>
            <div className="text-2xs text-ink-faint stat-num">{o.expectedTotal.toFixed(2)} total</div>
          </div>
          <Link href={`/team/${d.home.id}`} className="flex items-center justify-end gap-2 min-w-0">
            <span className="text-sm font-medium truncate text-right">{d.home.abbr ?? d.home.name}</span>
            <img src={teamCapLogoUrl(d.home.id)} alt="" className="w-6 h-6 team-logo opacity-90" />
          </Link>
        </div>

        {/* WP + NRFI + over lines */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Home WP" value={`${(o.pHomeWin * 100).toFixed(1)}%`} />
          <Stat
            label="P(NRFI)"
            value={`${(o.pNRFI * 100).toFixed(1)}%`}
            hint="No Runs in First Inning"
          />
          <Stat label="80% CI" value={`${o.ci80.low.toFixed(1)}–${o.ci80.high.toFixed(1)}`} />
          <Stat
            label="Confidence"
            value={`${o.confidence.score}/100`}
            color={
              o.confidence.level === 'high' ? 'pos' : o.confidence.level === 'medium' ? 'info' : 'muted'
            }
          />
        </div>

        {/* Over X.5 grid */}
        <div>
          <div className="label-micro mb-1.5">P(F5 total over X.5 runs)</div>
          <div className="grid grid-cols-5 gap-1 text-2xs">
            {o.pTotalOver.map((p) => (
              <div key={p.line} className="bg-bg-raised border border-line rounded text-center py-1">
                <div className="text-ink-faint stat-num">o{p.line}</div>
                <div className="stat-num font-medium text-ink">{(p.prob * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Starter rollups */}
        <div>
          <div className="label-micro mb-1.5">Starter F5 projections</div>
          <table className="w-full text-2xs">
            <thead>
              <tr className="text-ink-faint uppercase tracking-micro">
                <th className="text-left font-medium pb-1">Pitcher</th>
                <th className="text-right font-medium pb-1">IP</th>
                <th className="text-right font-medium pb-1">K</th>
                <th className="text-right font-medium pb-1">BB</th>
                <th className="text-right font-medium pb-1">H</th>
                <th className="text-right font-medium pb-1">HR</th>
                <th className="text-right font-medium pb-1">ER</th>
              </tr>
            </thead>
            <tbody>
              <StarterRow name={d.awayStarter?.name} id={d.awayStarter?.id} line={o.starters.away} />
              <StarterRow name={d.homeStarter?.name} id={d.homeStarter?.id} line={o.starters.home} />
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-2xs text-ink-faint pt-1">
          <span className="truncate">{d.venueName}</span>
          <Link href={`/game/${d.gamePk}`} className="hover:text-ink uppercase tracking-micro">
            full game →
          </Link>
        </div>
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  hint,
  color = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  color?: 'default' | 'pos' | 'info' | 'muted';
}) {
  const cls =
    color === 'pos' ? 'text-signal-pos' : color === 'info' ? 'text-signal-info' : color === 'muted' ? 'text-ink-muted' : 'text-ink';
  return (
    <div title={hint}>
      <div className="label-micro">{label}</div>
      <div className={`stat-num text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function StarterRow({
  name,
  id,
  line,
}: {
  name?: string;
  id?: number;
  line: First5CardData['output']['starters']['away'];
}) {
  if (!line || !name) {
    return (
      <tr className="border-t border-line-subtle">
        <td className="py-1 text-ink-faint">{name ? name : 'TBD'}</td>
        <td className="text-right text-ink-faint">—</td>
        <td className="text-right text-ink-faint">—</td>
        <td className="text-right text-ink-faint">—</td>
        <td className="text-right text-ink-faint">—</td>
        <td className="text-right text-ink-faint">—</td>
        <td className="text-right text-ink-faint">—</td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-line-subtle">
      <td className="py-1 truncate max-w-[160px]">
        {id ? (
          <Link href={`/player/${id}`} className="hover:text-accent">{name}</Link>
        ) : name}
      </td>
      <td className="text-right stat-num text-ink-muted">{line.inningsCovered.toFixed(1)}</td>
      <td className="text-right stat-num text-ink-muted">{line.expectedK.toFixed(1)}</td>
      <td className="text-right stat-num text-ink-muted">{line.expectedBB.toFixed(1)}</td>
      <td className="text-right stat-num text-ink-muted">{line.expectedHits.toFixed(1)}</td>
      <td className="text-right stat-num text-ink-muted">{line.expectedHRs.toFixed(2)}</td>
      <td className="text-right stat-num text-ink">{line.expectedRuns.toFixed(2)}</td>
    </tr>
  );
}
