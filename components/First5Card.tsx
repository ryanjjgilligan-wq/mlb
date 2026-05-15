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
  status?: 'preview' | 'live' | 'final';
  actual?: {
    f5Runs: number;
    f5Complete: boolean;
    firstInningRuns: number;
    firstInningComplete: boolean;
    /** Current actual total team scores — undefined pre-game. */
    awayRuns?: number;
    homeRuns?: number;
    inningState?: string;
    currentInning?: number;
  };
};

export function First5Card({ d }: { d: First5CardData }) {
  const o = d.output;
  const status = d.status ?? 'preview';

  // Grade the F5 prediction: line = round projection ± 0.5 → over if actual > line
  const f5Line = Math.floor(o.expectedTotal) + 0.5;
  let f5Result: 'pending' | 'live' | 'hit-over' | 'hit-under' | 'push' = 'pending';
  if (d.actual?.f5Complete) {
    if (d.actual.f5Runs > f5Line) f5Result = o.expectedTotal > f5Line ? 'hit-over' : 'hit-under';
    else if (d.actual.f5Runs < f5Line) f5Result = o.expectedTotal < f5Line ? 'hit-over' : 'hit-under';
    else f5Result = 'push';
  } else if (status === 'live') {
    f5Result = 'live';
  }

  // Grade NRFI
  let nrfiResult: 'pending' | 'live' | 'hit' | 'miss' = 'pending';
  if (d.actual?.firstInningComplete) {
    nrfiResult = d.actual.firstInningRuns === 0 ? 'hit' : 'miss';
  } else if (status === 'live') {
    nrfiResult = 'live';
  }

  // Visual border — green for hit, red for live or final-miss
  const isHit = f5Result === 'hit-over' || f5Result === 'hit-under';
  const borderCls =
    status === 'live' ? 'border-l-2 border-l-signal-neg' :
    isHit ? 'border-l-2 border-l-signal-pos' :
    status === 'final' ? 'border-l-2 border-l-signal-neg' :
    '';

  return (
    <article className={`panel overflow-hidden ${borderCls}`}>
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-bg-raised">
        <div className="flex items-center gap-2 min-w-0">
          {status === 'live' ? <Badge variant="neg" pulse>LIVE</Badge> : <Badge variant="info">F5</Badge>}
          {status === 'final' && <Badge>FINAL</Badge>}
          <span className="text-2xs text-ink-faint stat-num">{d.gamePk}</span>
        </div>
        <div className="flex items-center gap-2 text-2xs text-ink-faint">
          <LocalDate ymd={d.gameDate.slice(0, 10)} className="stat-num" />
          <span>·</span>
          <LocalTime iso={d.gameDate} format="time" className="stat-num" />
          {status === 'preview' && <Countdown iso={d.gameDate} status="Preview" prefix="· " />}
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* HERO — actual current score is the headline; F5 projection is supporting */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Away team */}
          <Link href={`/team/${d.away.id}`} className="flex items-center gap-2 min-w-0">
            <img src={teamCapLogoUrl(d.away.id)} alt="" className="w-7 h-7 team-logo opacity-95 shrink-0" />
            <div className="min-w-0">
              <div className="text-2xs text-ink-muted truncate">{d.away.abbr ?? d.away.name}</div>
              {d.actual ? (
                <div className="stat-num text-3xl font-bold leading-none">{d.actual.awayRuns ?? 0}</div>
              ) : (
                <div className="stat-num text-base font-semibold text-ink-muted">—</div>
              )}
            </div>
          </Link>

          {/* Center column — current state OR pre-game label */}
          <div className="text-center px-2">
            {d.actual ? (
              <>
                <div className="label-micro">{d.status === 'final' ? 'Final' : `${d.actual.inningState ?? ''} ${d.actual.currentInning ?? ''}`}</div>
                <div className="text-2xs text-ink-faint stat-num mt-1">F5 proj <span className="text-ink-muted">{o.expectedAwayRuns.toFixed(1)}–{o.expectedHomeRuns.toFixed(1)}</span></div>
                <div className="text-2xs text-ink-faint stat-num">{o.expectedTotal.toFixed(1)} total</div>
              </>
            ) : (
              <>
                <div className="label-micro">F5 projection</div>
                <div className="stat-num text-2xl font-semibold mt-0.5">
                  {o.expectedAwayRuns.toFixed(1)}–{o.expectedHomeRuns.toFixed(1)}
                </div>
                <div className="text-2xs text-ink-faint stat-num">{o.expectedTotal.toFixed(1)} total runs</div>
              </>
            )}
          </div>

          {/* Home team */}
          <Link href={`/team/${d.home.id}`} className="flex items-center justify-end gap-2 min-w-0">
            <div className="min-w-0 text-right">
              <div className="text-2xs text-ink-muted truncate">{d.home.abbr ?? d.home.name}</div>
              {d.actual ? (
                <div className="stat-num text-3xl font-bold leading-none">{d.actual.homeRuns ?? 0}</div>
              ) : (
                <div className="stat-num text-base font-semibold text-ink-muted">—</div>
              )}
            </div>
            <img src={teamCapLogoUrl(d.home.id)} alt="" className="w-7 h-7 team-logo opacity-95 shrink-0" />
          </Link>
        </div>

        {/* Actual outcomes (live/final games only) */}
        {d.actual && (
          <div className="px-3 py-2 -mx-4 border-y border-line-subtle bg-bg-raised/60">
            <div className="flex items-center justify-between gap-3 text-2xs">
              <div className="flex items-center gap-3">
                <span className="label-micro">Actual F5</span>
                <span className={`stat-num text-base font-semibold ${
                  f5Result === 'hit-over' || f5Result === 'hit-under' ? 'text-signal-pos' :
                  f5Result === 'push' ? 'text-ink-muted' :
                  status === 'final' ? 'text-signal-neg' :
                  'text-ink'
                }`}>
                  {d.actual.f5Runs} R{!d.actual.f5Complete && status === 'live' ? ` (in progress)` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {f5Result === 'hit-over' && <Badge variant="pos">✓ over hit</Badge>}
                {f5Result === 'hit-under' && <Badge variant="pos">✓ under hit</Badge>}
                {f5Result === 'push' && <Badge>push</Badge>}
                {f5Result === 'live' && <Badge variant="neg" pulse>live</Badge>}
                {f5Result === 'pending' && <Badge>pending</Badge>}
                {status === 'final' && f5Result !== 'hit-over' && f5Result !== 'hit-under' && f5Result !== 'push' && (
                  <Badge variant="neg">model miss</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-2xs mt-2">
              <div className="flex items-center gap-3">
                <span className="label-micro">NRFI</span>
                <span className={`stat-num text-base font-semibold ${
                  nrfiResult === 'hit' ? 'text-signal-pos' :
                  nrfiResult === 'miss' ? 'text-signal-neg' :
                  'text-ink'
                }`}>
                  {d.actual.firstInningRuns} R in 1st
                </span>
              </div>
              <div>
                {nrfiResult === 'hit' && <Badge variant="pos">✓ NRFI</Badge>}
                {nrfiResult === 'miss' && <Badge variant="neg">YRFI</Badge>}
                {nrfiResult === 'live' && <Badge variant="neg" pulse>live</Badge>}
                {nrfiResult === 'pending' && <Badge>pending</Badge>}
              </div>
            </div>
          </div>
        )}

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
