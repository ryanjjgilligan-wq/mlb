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

  const latestPitch = pitches[pitches.length - 1];

  return (
    <div
      className="rounded-lg border border-line-strong overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, #0a0a0e 0%, #0e0e14 50%, #0a0a0e 100%)',
        color: '#e8e8ec',
      }}
    >
      {/* TOP RAIL — broadcast-style header strip */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">AT-BAT</span>
          <span className="text-base font-bold text-white truncate">
            {batterName ?? 'Batter'}
          </span>
          <span className="text-white/40 text-xs uppercase tracking-wider">vs</span>
          <span className="text-base font-bold text-white truncate">
            {pitcherName ?? 'Pitcher'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BroadcastCount label="B" current={count.balls} max={4} color="#22c55e" />
          <BroadcastCount label="S" current={count.strikes} max={3} color="#ef4444" />
          <BroadcastCount label="O" current={outs} max={3} color="#9ca3af" />
        </div>
      </div>

      {/* MAIN STAGE — zone (huge) + pitch chips on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-0">
        {/* Zone canvas — dramatic dark with batter silhouette */}
        <div
          className="relative px-6 py-5 flex items-center justify-center min-h-[340px]"
          style={{
            background: 'radial-gradient(circle at 50% 60%, rgba(250,204,21,0.04) 0%, transparent 70%)',
          }}
        >
          {/* Sport-graphic header above the zone */}
          <div className="absolute top-3 left-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">
            <span>Strike zone</span>
            <span className="text-white/30">·</span>
            <span>{pitches.length} pitch{pitches.length === 1 ? '' : 'es'}</span>
          </div>

          <div className="absolute top-3 right-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">
            <span>Catcher's view</span>
          </div>

          <div className="flex items-end justify-center gap-2">
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

          {/* Latest pitch readout — broadcast graphic at the bottom of the zone */}
          {latestPitch && (
            <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-black"
                  style={{ background: pitchColor(latestPitch) }}
                >
                  {latestPitch.index + 1}
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="font-bold uppercase text-white tracking-wider">
                    {latestPitch.description ?? latestPitch.call ?? '—'}
                  </span>
                  <span className="text-white/50">
                    {latestPitch.pitchTypeName ?? latestPitch.pitchType ?? '—'}
                  </span>
                </div>
              </div>
              {latestPitch.startSpeed != null && (
                <div className="flex items-baseline gap-1">
                  <span className="stat-num text-2xl font-black text-white">{latestPitch.startSpeed.toFixed(0)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/50">MPH</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT RAIL — pitch sequence as broadcast-style chips */}
        <div className="border-t lg:border-t-0 lg:border-l border-white/10 bg-black/30">
          <div className="px-4 py-2.5 border-b border-white/5">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">Pitch sequence</div>
          </div>
          <ul className="divide-y divide-white/5 max-h-[290px] overflow-y-auto">
            {[...pitches].reverse().map((p, i) => (
              <PitchChip key={p.index} p={p} isLatest={i === 0} maxVelo={maxVelo ?? 100} minVelo={minVelo ?? 60} />
            ))}
          </ul>
        </div>
      </div>

      {/* BOTTOM RAIL — summary metrics + on base, broadcast-style */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/5 border-t border-white/10">
        <BroadcastMetric label="Avg Velo" value={avgVelo ? avgVelo.toFixed(1) : '—'} unit={avgVelo ? 'mph' : ''} />
        <BroadcastMetric
          label="Range"
          value={minVelo != null && maxVelo != null ? `${minVelo.toFixed(0)}–${maxVelo.toFixed(0)}` : '—'}
          unit={minVelo != null ? 'mph' : ''}
        />
        <BroadcastMetric
          label="Strikes / Balls"
          value={`${callCounts.calledStrikes + callCounts.whiffs + callCounts.fouls + callCounts.inPlay} / ${callCounts.balls}`}
        />
        <BroadcastMetric
          label="On base"
          value={(() => {
            const occ = [bases?.first, bases?.second, bases?.third].filter(Boolean).length;
            if (occ === 0) return 'Empty';
            if (occ === 3) return 'Loaded';
            return `${occ} on`;
          })()}
          accent={
            bases?.first || bases?.second || bases?.third ? 'pos' : 'muted'
          }
          rightAdornment={
            <BaseDiamond
              first={!!bases?.first}
              second={!!bases?.second}
              third={!!bases?.third}
            />
          }
        />
      </div>
    </div>
  );
}

function BroadcastCount({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded border"
      style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.4)' }}
    >
      <span className="text-[10px] uppercase tracking-wider font-bold text-white/60">{label}</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full transition-colors"
            style={{
              background: i < current ? color : 'transparent',
              border: i < current ? `1.5px solid ${color}` : '1.5px solid rgba(255,255,255,0.18)',
              boxShadow: i < current ? `0 0 6px ${color}88` : undefined,
            }}
          />
        ))}
      </div>
      <span className="stat-num text-xs font-black text-white ml-0.5">{current}</span>
    </div>
  );
}

function BroadcastMetric({
  label,
  value,
  unit,
  accent,
  rightAdornment,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: 'pos' | 'muted';
  rightAdornment?: React.ReactNode;
}) {
  const cls = accent === 'pos' ? 'text-accent' : accent === 'muted' ? 'text-white/40' : 'text-white';
  return (
    <div className="px-4 py-3 bg-black/30">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">{label}</div>
        {rightAdornment}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={`stat-num text-xl font-black ${cls}`}>{value}</span>
        {unit && <span className="text-[10px] uppercase tracking-wider text-white/40">{unit}</span>}
      </div>
    </div>
  );
}

function PitchChip({
  p,
  isLatest,
  maxVelo,
  minVelo,
}: {
  p: LivePitchEvent;
  isLatest: boolean;
  maxVelo: number;
  minVelo: number;
}) {
  const dotColor = pitchColor(p);
  const veloRange = Math.max(1, maxVelo - minVelo);
  const veloPct = p.startSpeed != null ? Math.max(8, ((p.startSpeed - minVelo) / veloRange) * 100) : 0;
  return (
    <li
      className={`px-4 py-2.5 transition-colors ${isLatest ? 'bg-accent/8' : ''}`}
      style={isLatest ? { boxShadow: 'inset 3px 0 0 #facc15' } : undefined}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0"
          style={{ background: dotColor, color: '#0a0a0e', boxShadow: `0 0 10px ${dotColor}55` }}
        >
          {p.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white truncate">
            {p.description ?? p.call ?? '—'}
          </div>
          <div className="text-xs text-white/55 truncate">{p.pitchTypeName ?? p.pitchType ?? '—'}</div>
        </div>
        {p.startSpeed != null && (
          <div className="text-right shrink-0">
            <div className="stat-num text-base font-black text-white leading-none">{p.startSpeed.toFixed(0)}</div>
            <div className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5">mph</div>
          </div>
        )}
      </div>
      {p.startSpeed != null && (
        <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${veloPct}%`, background: dotColor, boxShadow: `0 0 8px ${dotColor}88` }}
          />
        </div>
      )}
    </li>
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
