import Link from 'next/link';
import type { RunTotalOutput } from '@/lib/predict';

export function RunTotalPanel({
  output,
  homeName,
  awayName,
  parkName,
  weatherSummary,
  travelSummary,
}: {
  output: RunTotalOutput;
  homeName: string;
  awayName: string;
  parkName: string;
  weatherSummary?: string;
  travelSummary?: string;
}) {
  const total = output.expectedTotal;
  const max = Math.max(output.expectedHomeRuns, output.expectedAwayRuns, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
      <div className="space-y-3 self-start">
        <div>
          <div className="label-micro">Expected total</div>
          <div className="stat-num text-3xl font-semibold">{total.toFixed(2)}</div>
          <div className="text-2xs text-ink-faint">
            80% CI <span className="stat-num">{output.ci80.low.toFixed(1)}–{output.ci80.high.toFixed(1)}</span>
            <span className="px-1">·</span>
            95% CI <span className="stat-num">{output.ci95.low.toFixed(1)}–{output.ci95.high.toFixed(1)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-line-subtle">
          <div>
            <div className="label-micro">{awayName}</div>
            <div className="stat-num text-xl font-semibold">{output.expectedAwayRuns.toFixed(2)}</div>
          </div>
          <div>
            <div className="label-micro">{homeName}</div>
            <div className="stat-num text-xl font-semibold">{output.expectedHomeRuns.toFixed(2)}</div>
          </div>
        </div>
        <div className="pt-3 border-t border-line-subtle">
          <div className="label-micro">Implied home win %</div>
          <div className="stat-num text-xl font-semibold">{(output.pHomeWin * 100).toFixed(1)}%</div>
          <div className="text-2xs text-ink-faint mt-0.5">Normal approx on (home − away) runs</div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="label-micro">Run distribution by side</div>
        <div className="space-y-2">
          <RunBar label={`${awayName}`} value={output.expectedAwayRuns} max={max} />
          <RunBar label={`${homeName}`} value={output.expectedHomeRuns} max={max} />
        </div>

        <div className="pt-3 mt-2 border-t border-line-subtle">
          <div className="label-micro mb-2">Modifier ledger</div>
          <table className="w-full text-sm">
            <tbody>
              {output.modifiers.map((m) => (
                <tr key={m.name} className="border-b border-line-subtle last:border-0">
                  <td className="py-1 text-ink">{m.name}</td>
                  <td className="py-1 text-right stat-num w-20">
                    <span className={m.multiplier > 1.001 ? 'text-signal-pos' : m.multiplier < 0.999 ? 'text-signal-neg' : 'text-ink-muted'}>
                      ×{m.multiplier.toFixed(3)}
                    </span>
                  </td>
                  <td className="py-1 text-2xs text-ink-faint pl-3">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {output.warnings.length > 0 && (
          <ul className="text-2xs text-signal-warn mt-2 list-disc pl-4">
            {output.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        <p className="text-2xs text-ink-faint pt-2">
          Park <span className="text-ink-muted">{parkName}</span>
          {weatherSummary && <> · {weatherSummary}</>}
          {travelSummary && <> · {travelSummary}</>}
          <span className="px-2">·</span>
          Method on <Link href="/lab" className="underline">/lab</Link>.
        </p>
      </div>
    </div>
  );
}

function RunBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xs text-ink-muted w-32 truncate">{label}</span>
      <div className="flex-1 h-3 bg-bg-sunken rounded overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="stat-num text-sm font-medium w-12 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

export function PlayerPropsTable({
  rows,
  isPitcher = false,
}: {
  rows: Array<{
    name: string;
    playerId: number;
    pos?: string;
    expected: number;
    label: string; // "hits" or "Ks"
    columns: Array<{ key: string; label: string; value: string }>;
  }>;
  isPitcher?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
          <th className="text-left font-medium px-3 py-2">Player</th>
          {rows[0]?.columns.map((c) => (
            <th key={c.key} className="text-right font-medium px-2 py-2">{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.playerId} className="row-hover border-b border-line-subtle last:border-0">
            <td className="px-3 py-1.5">
              <Link href={`/player/${r.playerId}`} className="hover:text-accent text-sm">
                {r.name}
              </Link>
              {r.pos && <span className="text-2xs text-ink-faint ml-1.5">{r.pos}</span>}
            </td>
            {r.columns.map((c) => (
              <td key={c.key} className="text-right stat-num px-2 py-1.5 text-ink-muted">
                {c.value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
