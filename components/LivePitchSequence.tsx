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
  outs?: number;
  batterName?: string;
  pitcherName?: string;
  /** L = lefty batter, R = righty. Drives silhouette orientation. */
  batterBats?: string;
  /** Base occupancy for the "ON BASE" row. */
  bases?: { first?: { name: string }; second?: { name: string }; third?: { name: string } };
};

export function LivePitchSequence({
  pitches,
  count,
  outs = 0,
  batterName,
  pitcherName,
  batterBats,
  bases,
}: LivePitchSequenceProps) {
  if (!pitches.length) {
    return (
      <div className="px-6 py-8 text-2xs text-ink-faint text-center">
        Awaiting first pitch of the at-bat.
      </div>
    );
  }

  // Compute pitch summary stats for the right rail
  const velocities = pitches.map((p) => p.startSpeed).filter((v): v is number => typeof v === 'number');
  const avgVelo = velocities.length ? velocities.reduce((s, v) => s + v, 0) / velocities.length : null;
  const maxVelo = velocities.length ? Math.max(...velocities) : null;
  const minVelo = velocities.length ? Math.min(...velocities) : null;
  const callCounts = pitches.reduce((acc, p) => {
    const desc = (p.description ?? '').toLowerCase();
    if (desc.includes('ball')) acc.balls++;
    else if (desc.includes('foul')) acc.fouls++;
    else if (desc.includes('swinging') || desc.includes('whiff')) acc.whiffs++;
    else if (p.isInPlay) acc.inPlay++;
    else acc.calledStrikes++;
    return acc;
  }, { balls: 0, calledStrikes: 0, whiffs: 0, fouls: 0, inPlay: 0 });

  return (
    <div className="p-4 space-y-4">
      {/* HEADER — matchup name + count tiles inline */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="label-micro">Current at-bat</div>
          <div className="text-base font-semibold text-ink truncate mt-0.5">
            {batterName ?? 'Batter'} <span className="text-ink-faint font-normal mx-1">vs</span> {pitcherName ?? 'Pitcher'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CountTile label="B" current={count.balls} max={4} color="#16a34a" />
          <CountTile label="S" current={count.strikes} max={3} color="#dc2626" />
          <CountTile label="O" current={outs} max={3} color="#737373" />
        </div>
      </div>

      {/* MAIN — two columns: zone block (with summary stats baked in) + pitch table */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        {/* Zone block — strike zone + summary stats stacked inside one panel */}
        <div className="bg-bg-raised rounded-lg border border-line p-4 space-y-3">
          <div className="flex items-end justify-center gap-1">
            {batterBats === 'L' ? (
              <>
                <StrikeZone pitches={pitches} />
                <BatterSilhouette side="right" />
              </>
            ) : (
              <>
                <BatterSilhouette side="left" />
                <StrikeZone pitches={pitches} />
              </>
            )}
          </div>
          <div className="flex items-center justify-between text-2xs text-ink-faint border-t border-line-subtle pt-2">
            <span>catcher's view</span>
            <span className="flex items-center gap-1">
              last pitch
              <span className="inline-block w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
              glows
            </span>
          </div>

          {/* Velocity + calls baked into the same panel */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line-subtle">
            <div>
              <div className="label-micro mb-1">Velocity</div>
              <div className="flex items-baseline gap-1">
                <span className="stat-num text-xl font-bold text-ink">{avgVelo ? avgVelo.toFixed(1) : '—'}</span>
                <span className="text-2xs text-ink-faint">avg</span>
              </div>
              {minVelo != null && maxVelo != null && (
                <div className="text-2xs text-ink-faint stat-num">
                  {minVelo.toFixed(0)}–{maxVelo.toFixed(0)} mph
                </div>
              )}
            </div>
            <div>
              <div className="label-micro mb-1">Calls</div>
              <ul className="space-y-0.5 text-2xs">
                {[
                  { label: 'Ball', count: callCounts.balls, color: '#dc2626' },
                  { label: 'K', count: callCounts.calledStrikes, color: '#16a34a' },
                  { label: 'Whiff', count: callCounts.whiffs, color: '#2563eb' },
                  { label: 'Foul', count: callCounts.fouls, color: '#fb923c' },
                  { label: 'In play', count: callCounts.inPlay, color: '#facc15' },
                ].filter((r) => r.count > 0).map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.color }} />
                      <span className="text-ink-muted">{r.label}</span>
                    </span>
                    <span className="stat-num text-ink font-semibold">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Pitch log — table fills the entire right column */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="label-micro">Pitch sequence</span>
            <span className="text-2xs text-ink-faint stat-num">{pitches.length} pitch{pitches.length === 1 ? '' : 'es'}</span>
          </div>
          <div className="border border-line rounded-lg overflow-hidden bg-bg-raised">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                  <th className="text-left font-medium px-3 py-2 w-10">#</th>
                  <th className="text-left font-medium px-3 py-2">Result</th>
                  <th className="text-left font-medium px-3 py-2">Pitch</th>
                  <th className="text-left font-medium px-3 py-2 w-[120px]">Velocity</th>
                  <th className="text-right font-medium px-3 py-2 w-14">MPH</th>
                </tr>
              </thead>
              <tbody>
                {[...pitches].reverse().map((p, i) => (
                  <PitchRow key={p.index} p={p} isLatest={i === 0} maxVelo={maxVelo ?? 100} minVelo={minVelo ?? 60} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* BOTTOM — on-base diamond + chips */}
      <div className="flex items-center gap-3 pt-3 border-t border-line-subtle">
        <BaseDiamond first={!!bases?.first} second={!!bases?.second} third={!!bases?.third} />
        <div className="flex items-center gap-3 text-2xs">
          <BaseChip label="1B" name={bases?.first?.name} />
          <BaseChip label="2B" name={bases?.second?.name} />
          <BaseChip label="3B" name={bases?.third?.name} />
        </div>
      </div>
    </div>
  );
}

function CountTile({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-line bg-bg-raised">
      <span className="text-2xs uppercase tracking-micro font-semibold text-ink-muted">{label}</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              background: i < current ? color : 'transparent',
              border: i < current ? `1px solid ${color}` : '1px solid var(--line-strong)',
              boxShadow: i < current ? `0 0 4px ${color}55` : undefined,
            }}
          />
        ))}
      </div>
      <span className="stat-num text-xs font-bold text-ink ml-0.5">{current}</span>
    </div>
  );
}

function BaseChip({ label, name }: { label: string; name?: string }) {
  if (!name) {
    return (
      <span className="inline-flex items-center gap-1 text-ink-faint">
        <span className="stat-num text-2xs">{label}</span>
        <span>empty</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="stat-num text-2xs text-ink-faint">{label}</span>
      <span className="text-ink font-medium">{name}</span>
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-faint whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function BatterSilhouette({ side }: { side: 'left' | 'right' }) {
  // Stylized batter standing in the box, viewed from the catcher
  const flip = side === 'right' ? -1 : 1;
  return (
    <svg width="60" height="240" viewBox="0 0 60 240" className="shrink-0 hidden md:block">
      <g transform={`scale(${flip} 1) translate(${flip < 0 ? -60 : 0} 0)`} fill="var(--ink-muted)" opacity="0.55">
        {/* Helmet */}
        <ellipse cx="32" cy="38" rx="11" ry="13" />
        <rect x="22" y="36" width="16" height="6" />
        {/* Torso */}
        <path d="M 22 50 Q 30 48 38 50 L 42 90 Q 30 88 18 92 Z" />
        {/* Front leg */}
        <path d="M 22 92 L 18 145 L 22 175 L 30 175 L 30 145 L 28 95 Z" />
        {/* Back leg */}
        <path d="M 38 90 L 44 145 L 40 175 L 32 175 L 32 145 L 34 92 Z" />
        {/* Arms holding bat */}
        <path d="M 38 56 L 50 50 L 52 53 L 42 60 Z" />
        {/* Bat */}
        <line x1="50" y1="48" x2="14" y2="8" stroke="var(--ink-muted)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="14" cy="8" r="2.5" fill="var(--ink-muted)" />
      </g>
    </svg>
  );
}

function BaseDiamond({ first, second, third }: { first: boolean; second: boolean; third: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <g transform="translate(11 11) rotate(45) translate(-3.5 -3.5)">
        <rect x="6" y="-6" width="6" height="6" fill={first ? 'var(--accent)' : 'none'} stroke="var(--line-strong)" strokeWidth="0.8" />
        <rect x="0" y="-12" width="6" height="6" fill={second ? 'var(--accent)' : 'none'} stroke="var(--line-strong)" strokeWidth="0.8" />
        <rect x="-6" y="-6" width="6" height="6" fill={third ? 'var(--accent)' : 'none'} stroke="var(--line-strong)" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

function PitchRow({
  p,
  isLatest = false,
  maxVelo = 100,
  minVelo = 60,
}: {
  p: LivePitchEvent;
  isLatest?: boolean;
  maxVelo?: number;
  minVelo?: number;
}) {
  const dotColor = pitchColor(p);
  const veloRange = Math.max(1, maxVelo - minVelo);
  const veloPct = p.startSpeed != null ? Math.max(0, Math.min(100, ((p.startSpeed - minVelo) / veloRange) * 100)) : 0;
  return (
    <tr
      className={`border-t border-line-subtle first:border-0 ${
        isLatest ? 'bg-accent/8' : ''
      }`}
    >
      <td className="px-3 py-2.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center stat-num text-xs font-bold"
          style={{ background: dotColor, color: '#0a0a0b' }}
        >
          {p.index + 1}
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs uppercase tracking-micro font-bold text-ink truncate">
        {p.description ?? p.call ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-sm text-ink-muted truncate">{p.pitchTypeName ?? p.pitchType ?? '—'}</td>
      <td className="px-3 py-2.5">
        {p.startSpeed != null ? (
          <div className="h-2.5 rounded-full bg-bg-sunken overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(8, veloPct)}%`, background: dotColor }}
            />
          </div>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right stat-num text-base font-bold text-ink">
        {p.startSpeed != null ? p.startSpeed.toFixed(0) : '—'}
      </td>
    </tr>
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
