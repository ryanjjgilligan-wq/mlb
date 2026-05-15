import Link from 'next/link';
import type { BatterProp } from '@/lib/predict';

export type LivePropRow = {
  batterId: number;
  batterName: string;
  predicted: BatterProp;
  actual: {
    pa: number;
    ab: number;
    hits: number;
    doubles: number;
    homeRuns: number;
    walks: number;
    strikeouts: number;
    totalBases: number;
  };
};

/**
 * Per-batter live prop tracking. Each row shows:
 *   - Predicted xH / xTB / xHR / xBB / xK
 *   - Actual current line (H/AB, K, BB, HR, TB)
 *   - Pace projection: actual_so_far + remaining_pa × predicted_per_pa_rate
 *   - Visual indicator green if actual > predicted pace, red if behind
 */
export function LivePropTracker({
  rows,
  teamName,
  inningsCompleted,
}: {
  rows: LivePropRow[];
  teamName: string;
  inningsCompleted: number;
}) {
  if (!rows.length) return null;

  return (
    <div className="p-3">
      <div className="label-micro mb-2 px-1 truncate">{teamName} · live vs projected</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
              <th className="text-left font-medium pb-1">Player</th>
              <th className="text-right font-medium pb-1">PA</th>
              <th className="text-right font-medium pb-1">H</th>
              <th className="text-right font-medium pb-1">2B</th>
              <th className="text-right font-medium pb-1">HR</th>
              <th className="text-right font-medium pb-1">BB</th>
              <th className="text-right font-medium pb-1">K</th>
              <th className="text-right font-medium pb-1">TB</th>
              <th className="text-right font-medium pb-1">Pace H</th>
              <th className="text-right font-medium pb-1">vs xH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const remainingPa = Math.max(0, 4 - r.actual.pa);
              const paceH = r.actual.hits + remainingPa * 0.91 * (r.predicted.expectedHits / 4 / 0.91);
              const vsPredicted = paceH - r.predicted.expectedHits;
              return (
                <tr key={r.batterId} className="row-hover border-t border-line-subtle">
                  <td className="py-1 pr-2">
                    <Link href={`/player/${r.batterId}`} className="text-sm hover:text-accent">{r.batterName}</Link>
                  </td>
                  <td className="text-right stat-num text-ink-muted">{r.actual.pa}</td>
                  <Cell actual={r.actual.hits} predicted={r.predicted.expectedHits} />
                  <Cell actual={r.actual.doubles} predicted={r.predicted.expectedDoubles} />
                  <Cell actual={r.actual.homeRuns} predicted={r.predicted.expectedHRs} />
                  <Cell actual={r.actual.walks} predicted={r.predicted.expectedWalks} />
                  <Cell actual={r.actual.strikeouts} predicted={r.predicted.expectedStrikeouts} invert />
                  <Cell actual={r.actual.totalBases} predicted={r.predicted.expectedTotalBases} />
                  <td className="text-right stat-num text-ink-muted">{paceH.toFixed(1)}</td>
                  <td className={`text-right stat-num ${vsPredicted > 0.3 ? 'text-signal-pos' : vsPredicted < -0.3 ? 'text-signal-neg' : 'text-ink-muted'}`}>
                    {vsPredicted > 0 ? '+' : ''}{vsPredicted.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-ink-faint mt-2">
        Each cell shows actual / projected. Green = exceeding projection · red = behind. K column inverted (low is good for batter).
      </p>
    </div>
  );
}

function Cell({ actual, predicted, invert = false }: { actual: number; predicted: number; invert?: boolean }) {
  // For most stats, more = better. For K, less = better (invert).
  const ahead = invert ? actual < predicted : actual > predicted;
  const behind = invert ? actual > predicted : actual < predicted * 0.7;
  const cls = ahead ? 'text-signal-pos' : behind ? 'text-signal-neg' : 'text-ink-muted';
  return (
    <td className={`text-right stat-num pl-2 ${cls}`}>
      {actual}<span className="text-ink-faint">/{predicted.toFixed(1)}</span>
    </td>
  );
}
