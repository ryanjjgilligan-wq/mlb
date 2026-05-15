/**
 * Side-by-side bar — multiple values on a shared axis with the leader bolded.
 * Higher-is-better support; for "lower is better" stats just pre-invert the
 * value array or use the inversion flag.
 */
export function CompareBar({
  label,
  values,
  format,
  domain,
  lowerIsBetter = false,
  hint,
}: {
  label: string;
  values: { entityKey: string; value: number; color: string }[];
  format?: (v: number) => string;
  domain?: [number, number];
  lowerIsBetter?: boolean;
  hint?: string;
}) {
  const finite = values.filter((v) => Number.isFinite(v.value));
  if (!finite.length) {
    return (
      <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 items-center text-2xs text-ink-faint">
        <span>{label}</span>
        <span>no data</span>
      </div>
    );
  }
  const fmt = format ?? ((v: number) => v.toFixed(3));
  const min = domain?.[0] ?? Math.min(...finite.map((v) => v.value));
  const max = domain?.[1] ?? Math.max(...finite.map((v) => v.value));
  const range = max - min || 1;
  const bestVal = lowerIsBetter
    ? Math.min(...finite.map((v) => v.value))
    : Math.max(...finite.map((v) => v.value));

  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 items-start" title={hint}>
      <div className="text-2xs text-ink-muted">{label}</div>
      <div className="space-y-1">
        {values.map((v) => {
          const isBest = v.value === bestVal;
          const pct = Number.isFinite(v.value) ? Math.max(0, Math.min(100, ((v.value - min) / range) * 100)) : 0;
          return (
            <div key={v.entityKey} className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-bg-sunken rounded overflow-hidden relative">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: Number.isFinite(v.value) ? `${pct}%` : '0%',
                    background: v.color,
                    opacity: isBest ? 1 : 0.55,
                  }}
                />
              </div>
              <span
                className={`stat-num text-2xs w-14 text-right ${isBest ? 'text-ink font-semibold' : 'text-ink-muted'}`}
              >
                {Number.isFinite(v.value) ? fmt(v.value) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
