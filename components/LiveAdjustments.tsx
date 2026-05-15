import { Badge } from './ui/Badge';
import {
  liveProjectedTotal,
  gradeNRFI,
  gradeF5,
  overStillLive,
  type LiveGameState,
} from '@/lib/liveAdjust';

export function LiveAdjustments({
  state,
  preGameTotal,
  preGameNRFI,
  preGameF5Total,
}: {
  state: LiveGameState;
  preGameTotal: number;
  preGameNRFI: number;
  preGameF5Total: number;
}) {
  const live = liveProjectedTotal(preGameTotal, state);
  const nrfiResult = gradeNRFI(state);
  const f5Over = gradeF5(state, preGameF5Total, 'over');
  const totalSoFar = state.awayRuns + state.homeRuns;

  // Show "is over still live?" for common total lines around the pre-game projection
  const lines = [Math.floor(preGameTotal) + 0.5, Math.floor(preGameTotal) - 0.5, Math.floor(preGameTotal) - 1.5].filter((l) => l > 0);

  return (
    <div className="space-y-4">
      {/* Headline live total */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-3 border-b border-line-subtle">
        <div>
          <div className="label-micro">Pre-game total</div>
          <div className="stat-num text-2xl font-semibold text-ink-muted">{preGameTotal.toFixed(1)}</div>
        </div>
        <div>
          <div className="label-micro">Live projected total</div>
          <div className={`stat-num text-2xl font-semibold ${
            Math.abs(live.live - preGameTotal) < 1 ? 'text-ink' :
            live.live > preGameTotal ? 'text-signal-pos' : 'text-signal-neg'
          }`}>
            {live.live.toFixed(1)}
          </div>
          <div className="text-2xs text-ink-faint">
            {totalSoFar} runs through {(9 - live.inningsRemaining).toFixed(0)} inn ·{' '}
            <span className="stat-num">{live.rateCarry.toFixed(2)}</span> R/inn carry
          </div>
        </div>
        <div>
          <div className="label-micro">Drift vs pre-game</div>
          <div className={`stat-num text-2xl font-semibold ${
            live.live > preGameTotal + 0.5 ? 'text-signal-pos' :
            live.live < preGameTotal - 0.5 ? 'text-signal-neg' : 'text-ink'
          }`}>
            {live.live > preGameTotal ? '+' : ''}{(live.live - preGameTotal).toFixed(1)}
          </div>
        </div>
      </div>

      {/* NRFI grade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SubGameCard
          label="NRFI / YRFI"
          desc={`Pre-game P(NRFI) = ${(preGameNRFI * 100).toFixed(1)}%`}
          status={nrfiResult}
          actual={(() => {
            const first = state.innings.find((i) => i.num === 1);
            if (!first) return 'awaiting first inning';
            const r = (first.away?.runs ?? 0) + (first.home?.runs ?? 0);
            return r === 0 ? '0 R in 1st (so far)' : `${r} R in 1st`;
          })()}
        />
        <SubGameCard
          label={`F5 over ${preGameF5Total.toFixed(1)}`}
          desc={`Pre-game F5 expected ${preGameF5Total.toFixed(1)} runs`}
          status={f5Over.result}
          actual={f5Over.f5Runs !== null ? `${f5Over.f5Runs} R through F5` : 'not yet 5'}
        />
      </div>

      {/* Is the over still live? */}
      <div>
        <div className="label-micro mb-2">Over-line viability</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {lines.map((line) => {
            const v = overStillLive(state, line, live.rateCarry);
            const cls =
              v.status === 'lock' ? 'border-signal-pos/40 bg-signal-pos/10 text-signal-pos' :
              v.status === 'live' ? 'border-signal-pos/30 bg-signal-pos/5 text-signal-pos' :
              v.status === 'longshot' ? 'border-signal-warn/30 bg-signal-warn/5 text-signal-warn' :
              'border-signal-neg/30 bg-signal-neg/5 text-signal-neg';
            return (
              <div key={line} className={`px-3 py-2 rounded border ${cls}`}>
                <div className="flex items-center justify-between">
                  <span className="text-2xs uppercase tracking-micro font-medium">over {line}</span>
                  <span className="text-2xs uppercase tracking-micro font-semibold">{v.status}</span>
                </div>
                <div className="text-2xs mt-1 opacity-90">
                  {v.status === 'lock' ? 'pushed' :
                   v.status === 'dead' ? 'mathematically out' :
                   <>need <span className="stat-num">{v.runsNeeded}</span> · <span className="stat-num">{v.perInningRequired.toFixed(1)}</span>/inn</>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SubGameCard({
  label,
  desc,
  status,
  actual,
}: {
  label: string;
  desc: string;
  status: 'win' | 'loss' | 'push' | 'pending';
  actual: string;
}) {
  const variant = status === 'win' ? 'pos' : status === 'loss' ? 'neg' : 'neutral';
  return (
    <div className="px-3 py-2.5 rounded border border-line bg-bg-raised">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="label-micro">{label}</div>
          <div className="text-2xs text-ink-faint mt-0.5">{desc}</div>
        </div>
        <Badge variant={variant} className="shrink-0">
          {status === 'pending' ? 'live' : status}
        </Badge>
      </div>
      <div className="text-sm text-ink-muted mt-1.5 stat-num">{actual}</div>
    </div>
  );
}
