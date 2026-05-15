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
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 items-start p-4">
      {/* Strike zone */}
      <div>
        <div className="label-micro mb-2">Pitch locations · this AB</div>
        <StrikeZone pitches={pitches} />
        <div className="text-2xs text-ink-faint mt-1.5 text-center">
          catcher's view · count <span className="stat-num text-ink-muted">{count.balls}-{count.strikes}</span> · last pitch glows
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
  // Standard strike zone: x ∈ [-0.83, 0.83] feet (17"), z ∈ [1.5, 3.5] feet (typical)
  // Bigger canvas, more detail.
  const W = 260;
  const H = 290;
  const xToPx = (pX: number) => W / 2 + pX * 75;
  const zToPx = (pZ: number) => H - 30 - (pZ - 0) * 52;

  const zoneLeft = xToPx(-0.83);
  const zoneRight = xToPx(0.83);
  const zoneTop = zToPx(3.5);
  const zoneBottom = zToPx(1.5);
  const zoneW = zoneRight - zoneLeft;
  const zoneH = zoneBottom - zoneTop;

  // Extended "called" zone — umps tend to call ~1 ball outside the rulebook
  // zone as a strike (especially low). Show it as a faint outline.
  const extLeft = xToPx(-0.95);
  const extRight = xToPx(0.95);
  const extTop = zToPx(3.65);
  const extBottom = zToPx(1.4);

  // Filter to only pitches with coords for clean rendering
  const located = pitches.filter((p) => p.pX !== undefined && p.pZ !== undefined);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
      <defs>
        {/* Strike zone background gradient — subtle radial highlight */}
        <radialGradient id="zoneBg" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(250, 204, 21, 0.06)" />
          <stop offset="100%" stopColor="rgba(250, 204, 21, 0.02)" />
        </radialGradient>
        {/* Glow filters for each pitch type */}
        <filter id="pitchGlow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect width={W} height={H} fill="var(--bg-sunken)" rx="8" />

      {/* Ground line + home plate hint at bottom */}
      <line x1="20" y1={H - 30} x2={W - 20} y2={H - 30} stroke="var(--line)" strokeWidth="1" />
      <polygon
        points={`${W / 2 - 30},${H - 30} ${W / 2 + 30},${H - 30} ${W / 2 + 25},${H - 22} ${W / 2},${H - 12} ${W / 2 - 25},${H - 22}`}
        fill="var(--bg-raised)"
        stroke="var(--ink-faint)"
        strokeWidth="1"
        opacity="0.7"
      />

      {/* Extended (called) zone — faint dashed outline */}
      <rect
        x={extLeft}
        y={extTop}
        width={extRight - extLeft}
        height={extBottom - extTop}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.4"
      />

      {/* Strike zone */}
      <rect
        x={zoneLeft}
        y={zoneTop}
        width={zoneW}
        height={zoneH}
        fill="url(#zoneBg)"
        stroke="var(--ink-muted)"
        strokeWidth="2"
      />

      {/* Inner 3×3 grid */}
      {[1, 2].map((i) => (
        <g key={i}>
          <line
            x1={zoneLeft + (zoneW * i) / 3}
            y1={zoneTop}
            x2={zoneLeft + (zoneW * i) / 3}
            y2={zoneBottom}
            stroke="var(--line)"
            strokeDasharray="2 3"
          />
          <line
            x1={zoneLeft}
            y1={zoneTop + (zoneH * i) / 3}
            x2={zoneRight}
            y2={zoneTop + (zoneH * i) / 3}
            stroke="var(--line)"
            strokeDasharray="2 3"
          />
        </g>
      ))}

      {/* Faint sequence trail connecting consecutive pitches */}
      {located.length > 1 && (
        <polyline
          points={located.map((p) => `${xToPx(p.pX!)},${zToPx(p.pZ!)}`).join(' ')}
          fill="none"
          stroke="var(--ink-faint)"
          strokeWidth="1"
          strokeDasharray="2 2"
          opacity="0.5"
        />
      )}

      {/* Pitches — with shadow halo + colored core + index */}
      {located.map((p, i) => {
        const cx = xToPx(p.pX!);
        const cy = zToPx(p.pZ!);
        const r = p.startSpeed ? Math.min(11, Math.max(6, p.startSpeed / 10)) : 7;
        const fill = pitchColor(p);
        const isLast = i === located.length - 1;
        return (
          <g key={i}>
            {/* Soft outer glow */}
            <circle cx={cx} cy={cy} r={r + 3} fill={fill} opacity="0.18" />
            {/* Solid core */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={fill}
              stroke={isLast ? '#fff' : 'var(--bg-sunken)'}
              strokeWidth={isLast ? 2 : 1.2}
              filter={isLast ? 'url(#pitchGlow)' : undefined}
            />
            {/* Index inside */}
            <text
              x={cx}
              y={cy + r * 0.35}
              textAnchor="middle"
              fontSize={r * 0.95}
              fontFamily="ui-monospace"
              fontWeight="700"
              fill="#0a0a0b"
            >
              {p.index + 1}
            </text>
            {/* Velocity label slightly offset */}
            {p.startSpeed && (
              <text
                x={cx + r + 4}
                y={cy + 3}
                fontSize="8.5"
                fontFamily="ui-monospace"
                fill="var(--ink-muted)"
                opacity="0.85"
              >
                {p.startSpeed.toFixed(0)}
              </text>
            )}
          </g>
        );
      })}

      {/* Color legend at bottom */}
      <g transform={`translate(0 ${H - 8})`}>
        {[
          { color: '#dc2626', label: 'B' },
          { color: '#16a34a', label: 'CS' },
          { color: '#2563eb', label: 'WS' },
          { color: '#fb923c', label: 'F' },
          { color: '#facc15', label: 'IP' },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${20 + i * 46} 0)`}>
            <circle cx={0} cy={0} r="3.5" fill={item.color} />
            <text x={6} y={3} fontSize="8" fontFamily="ui-monospace" fill="var(--ink-faint)">
              {item.label}
            </text>
          </g>
        ))}
      </g>
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
