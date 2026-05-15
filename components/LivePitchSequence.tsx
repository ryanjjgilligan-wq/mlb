/**
 * Live pitch sequence visualization for the current at-bat.
 *
 * Renders a strike zone with each pitch in this AB plotted as a colored dot
 * by its (pX, pZ) plate location, sized by velocity. Below: a pitch log with
 * type, velocity, and result.
 */

export type LivePitchEvent = {
  index: number;
  pitchType?: string;       // e.g. 'FF', 'SL', 'CH'
  pitchTypeName?: string;   // 'Four-Seam Fastball'
  startSpeed?: number;      // mph
  pX?: number;              // plate horizontal (feet, batter perspective)
  pZ?: number;              // plate vertical (feet)
  call?: string;            // 'B' / 'S' / etc.
  description?: string;     // 'Ball', 'Called Strike', 'Foul', etc.
  isInPlay?: boolean;
  result?: string;          // for in-play pitches
};

export type LivePitchSequenceProps = {
  pitches: LivePitchEvent[];
  count: { balls: number; strikes: number };
  batterName?: string;
  pitcherName?: string;
};

export function LivePitchSequence({ pitches, count, batterName, pitcherName }: LivePitchSequenceProps) {
  if (!pitches.length) {
    return (
      <div className="px-4 py-6 text-2xs text-ink-faint text-center">
        Awaiting first pitch of the at-bat.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start p-4">
      {/* Strike zone */}
      <div>
        <div className="label-micro mb-1.5">Pitch locations · this AB</div>
        <StrikeZone pitches={pitches} />
        <div className="text-2xs text-ink-faint mt-1.5 text-center">
          batter view · count <span className="stat-num text-ink-muted">{count.balls}-{count.strikes}</span>
        </div>
      </div>

      {/* Pitch log */}
      <div>
        <div className="label-micro mb-1.5">{batterName} vs {pitcherName}</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
              <th className="text-left font-medium pb-1 w-6">#</th>
              <th className="text-left font-medium pb-1">Pitch</th>
              <th className="text-right font-medium pb-1">MPH</th>
              <th className="text-left font-medium pb-1 pl-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {pitches.map((p) => (
              <tr key={p.index} className="border-t border-line-subtle">
                <td className="py-1 stat-num text-ink-faint">{p.index + 1}</td>
                <td className="py-1 truncate">{p.pitchTypeName ?? p.pitchType ?? '—'}</td>
                <td className="py-1 text-right stat-num text-ink-muted">{p.startSpeed ? p.startSpeed.toFixed(1) : '—'}</td>
                <td className="py-1 pl-3">
                  <span className={`text-2xs px-1.5 py-0.5 rounded ${resultClass(p)}`}>
                    {p.description ?? p.call ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StrikeZone({ pitches }: { pitches: LivePitchEvent[] }) {
  // Standard strike zone: x ∈ [-0.83, 0.83] feet, z ∈ [1.5, 3.5] feet
  // We'll render in a 200x220 SVG with the zone occupying roughly the center.
  const W = 200;
  const H = 220;
  // Map plate coords to pixel coords. View is from the catcher's POV (or
  // equivalently, batter's view): positive pX = to the catcher's right, which
  // for a RHB is inside (toward the batter). We'll keep it untouched: positive
  // pX = right side of the screen.
  const xToPx = (pX: number) => W / 2 + pX * 60;
  const zToPx = (pZ: number) => H - 20 - (pZ - 0) * 38; // ground at H-20, scale ~38px/ft

  const zoneLeft = xToPx(-0.83);
  const zoneRight = xToPx(0.83);
  const zoneTop = zToPx(3.5);
  const zoneBottom = zToPx(1.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
      {/* Ground */}
      <line x1="0" y1={H - 20} x2={W} y2={H - 20} stroke="var(--line)" strokeWidth="1" />
      {/* Zone */}
      <rect
        x={zoneLeft}
        y={zoneTop}
        width={zoneRight - zoneLeft}
        height={zoneBottom - zoneTop}
        fill="var(--bg-raised)"
        stroke="var(--line-strong)"
        strokeWidth="1.5"
      />
      {/* Inner ⅓ grid lines */}
      <line x1={zoneLeft + (zoneRight - zoneLeft) / 3} y1={zoneTop} x2={zoneLeft + (zoneRight - zoneLeft) / 3} y2={zoneBottom} stroke="var(--line)" strokeDasharray="2 2" />
      <line x1={zoneLeft + 2 * (zoneRight - zoneLeft) / 3} y1={zoneTop} x2={zoneLeft + 2 * (zoneRight - zoneLeft) / 3} y2={zoneBottom} stroke="var(--line)" strokeDasharray="2 2" />
      <line x1={zoneLeft} y1={zoneTop + (zoneBottom - zoneTop) / 3} x2={zoneRight} y2={zoneTop + (zoneBottom - zoneTop) / 3} stroke="var(--line)" strokeDasharray="2 2" />
      <line x1={zoneLeft} y1={zoneTop + 2 * (zoneBottom - zoneTop) / 3} x2={zoneRight} y2={zoneTop + 2 * (zoneBottom - zoneTop) / 3} stroke="var(--line)" strokeDasharray="2 2" />

      {/* Pitches */}
      {pitches.map((p, i) => {
        if (p.pX === undefined || p.pZ === undefined) return null;
        const cx = xToPx(p.pX);
        const cy = zToPx(p.pZ);
        const r = p.startSpeed ? Math.min(8, Math.max(4, p.startSpeed / 12)) : 5;
        const fill = pitchColor(p);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill={fill} stroke="var(--bg-sunken)" strokeWidth="1" opacity={0.85} />
            <text x={cx} y={cy + 2.5} textAnchor="middle" fontSize="8" fontFamily="ui-monospace" fontWeight="600" fill="var(--bg)">
              {p.index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function pitchColor(p: LivePitchEvent): string {
  const desc = (p.description ?? '').toLowerCase();
  const call = (p.call ?? '').toLowerCase();
  if (desc.includes('home run') || desc.includes('triple') || desc.includes('double') || desc.includes('single') || (p.isInPlay && !desc.includes('out'))) return '#facc15';
  if (p.isInPlay) return '#9a9aa3';
  if (desc.includes('foul')) return '#fb923c';
  if (call === 'b' || desc.includes('ball')) return '#dc2626';
  if (desc.includes('swinging strike') || desc.includes('whiff')) return '#2563eb';
  if (call === 's' || desc.includes('strike')) return '#16a34a';
  return '#62626b';
}

function resultClass(p: LivePitchEvent): string {
  const desc = (p.description ?? '').toLowerCase();
  if (desc.includes('home run') || desc.includes('hit')) return 'bg-accent/15 text-accent';
  if (p.isInPlay) return 'bg-ink-muted/10 text-ink-muted';
  if (desc.includes('foul')) return 'bg-signal-warn/10 text-signal-warn';
  if (desc.includes('ball')) return 'bg-signal-neg/10 text-signal-neg';
  if (desc.includes('swinging') || desc.includes('whiff')) return 'bg-signal-info/10 text-signal-info';
  if (desc.includes('strike')) return 'bg-signal-pos/10 text-signal-pos';
  return 'bg-bg-raised text-ink-muted';
}
