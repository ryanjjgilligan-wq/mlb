export type LeveragePoint = {
  idx: number;
  wpa: number; // signed swing from home perspective (-1..1)
  abs: number;
  inning: number;
  half?: 'top' | 'bot';
  desc?: string;
};

/**
 * High-leverage plays as a clean ranked list. Each row shows:
 *   - Rank
 *   - Inning marker (Top 7th)
 *   - Play description
 *   - Inline magnitude bar (length = |WPA|, color = direction)
 *   - Signed WPA percentage on the right
 *
 * Replaces the prior bar-chart-of-mystery-bars. Much more legible.
 */
export function LeverageChart({
  data,
  homeAbbr,
  awayAbbr,
}: {
  data: LeveragePoint[];
  homeAbbr?: string;
  awayAbbr?: string;
}) {
  // Only include plays with meaningful swings (≥ 2pp WP change)
  const filtered = data.filter((d) => d.abs >= 0.02);
  if (!filtered.length) {
    return (
      <div className="px-4 py-8 text-2xs text-ink-faint text-center">
        No high-leverage plays yet — every play has moved win probability by less than 2%.
      </div>
    );
  }

  // Sort by absolute magnitude descending
  const sorted = [...filtered].sort((a, b) => b.abs - a.abs).slice(0, 10);
  const maxAbs = sorted[0]?.abs ?? 0.05;

  return (
    <ul className="divide-y divide-line-subtle">
      {sorted.map((p, i) => {
        const pct = p.wpa * 100;
        const sign = pct >= 0 ? '+' : '−';
        // Direction labels: positive WPA = home favored, negative = away favored
        const beneficiary = pct >= 0 ? (homeAbbr ?? 'home') : (awayAbbr ?? 'away');
        const barWidth = Math.min(100, (p.abs / maxAbs) * 100);
        const cls = pct >= 0 ? 'bg-signal-pos' : 'bg-signal-neg';
        const txtCls = pct >= 0 ? 'text-signal-pos' : 'text-signal-neg';
        return (
          <li key={`${p.idx}-${i}`} className="px-4 py-2.5">
            <div className="grid grid-cols-[24px_1fr_auto] items-start gap-3">
              {/* Rank */}
              <span className="stat-num text-2xs text-ink-faint mt-0.5">#{i + 1}</span>

              {/* Description column */}
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xs uppercase tracking-micro text-ink-muted stat-num shrink-0">
                    {p.half === 'top' ? 'Top' : p.half === 'bot' ? 'Bot' : ''} {p.inning > 0 ? `${p.inning}${ord(p.inning)}` : ''}
                  </span>
                  <span className="text-sm text-ink leading-snug truncate">
                    {p.desc ?? '—'}
                  </span>
                </div>
                {/* Inline magnitude bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-bg-sunken overflow-hidden">
                    <div
                      className={`h-full ${cls} rounded-full`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-2xs text-ink-faint stat-num">
                    favors {beneficiary}
                  </span>
                </div>
              </div>

              {/* Signed WPA percentage */}
              <span className={`stat-num text-base font-semibold ${txtCls} shrink-0 tabular-nums`}>
                {sign}{Math.abs(pct).toFixed(1)}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ord(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  const last = n % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}
