import Link from 'next/link';

export type LiveFieldData = {
  isTopInning: boolean;
  inning: number;
  inningState: string;
  outs: number;
  balls: number;
  strikes: number;
  awayName: string;
  awayAbbr?: string;
  homeName: string;
  homeAbbr?: string;
  // Offense
  batter?: { id: number; name: string; bats?: string };
  onDeck?: { id: number; name: string };
  inHole?: { id: number; name: string };
  first?: { id: number; name: string };
  second?: { id: number; name: string };
  third?: { id: number; name: string };
  // Defense
  pitcher?: { id: number; name: string; throws?: string; pitchesThrown?: number };
  catcher?: { id: number; name: string };
};

/**
 * Big visual baseball field. Diamond with runners by name, current pitcher,
 * current batter, count and outs as pixel dots. Refreshes with the parent's
 * 15-second auto-refresh.
 */
export function LiveGameField({ d }: { d: LiveFieldData }) {
  const battingTeam = d.isTopInning ? d.awayName : d.homeName;
  const pitchingTeam = d.isTopInning ? d.homeName : d.awayName;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6 items-start">
      {/* Real-looking baseball field, top-down view */}
      <div className="relative mx-auto">
        <svg viewBox="0 0 400 400" width="320" height="320" className="block">
          <defs>
            {/* Grass gradient — slight radial darkening toward outfield */}
            <radialGradient id="grass" cx="50%" cy="100%" r="120%">
              <stop offset="0%" stopColor="#3a7a3a" />
              <stop offset="50%" stopColor="#2c6a2c" />
              <stop offset="100%" stopColor="#1f4f1f" />
            </radialGradient>
            {/* Dirt gradient */}
            <radialGradient id="dirt" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#a17a4d" />
              <stop offset="100%" stopColor="#7a5a36" />
            </radialGradient>
            {/* Mound gradient with subtle highlight */}
            <radialGradient id="mound" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#b88a55" />
              <stop offset="100%" stopColor="#7a5a36" />
            </radialGradient>
            {/* Mowed-grass alternating stripes */}
            <pattern id="mow" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
              <rect width="40" height="40" fill="#2c6a2c" />
              <rect width="40" height="20" fill="#357535" />
            </pattern>
          </defs>

          {/* Outfield grass — fan from home plate to wall, true sector shape */}
          <path
            d="M 200 320 L 30 150 A 240 240 0 0 1 370 150 Z"
            fill="url(#grass)"
          />
          {/* Mowed-grass stripes overlay (subtle) */}
          <path
            d="M 200 320 L 30 150 A 240 240 0 0 1 370 150 Z"
            fill="url(#mow)"
            opacity="0.18"
          />
          {/* Outfield wall */}
          <path
            d="M 30 150 A 240 240 0 0 1 370 150"
            fill="none"
            stroke="#e5e4e1"
            strokeWidth="2"
            opacity="0.35"
          />

          {/* Infield dirt — circle around the infield */}
          <circle cx="200" cy="240" r="105" fill="url(#dirt)" />

          {/* Infield grass diamond inside the dirt cutout */}
          <polygon
            points="200,310 264,246 200,182 136,246"
            fill="#357535"
            stroke="#fff"
            strokeWidth="2"
            strokeOpacity="0.85"
          />

          {/* Foul lines (clearly visible white chalk) */}
          <line x1="200" y1="310" x2="40" y2="150" stroke="#fff" strokeWidth="2" opacity="0.85" />
          <line x1="200" y1="310" x2="360" y2="150" stroke="#fff" strokeWidth="2" opacity="0.85" />

          {/* Base paths — implied by infield diamond edges, already drawn */}

          {/* Pitcher's mound */}
          <circle cx="200" cy="246" r="20" fill="url(#mound)" />
          {/* Pitching rubber (white slab) */}
          <rect x="194" y="244" width="12" height="3.5" fill="#fff" rx="0.5" />

          {/* Bases */}
          <Base x={264} y={246} occupied={!!d.first} highlight={false} />
          <Base x={200} y={182} occupied={!!d.second} highlight={false} />
          <Base x={136} y={246} occupied={!!d.third} highlight={false} />

          {/* Home plate (pentagon shape pointing toward the catcher / out of frame) */}
          <polygon
            points="200,318 191,310 191,302 209,302 209,310"
            fill="#fff"
            stroke="#222"
            strokeWidth="0.8"
          />

          {/* Batter's box outlines (rectangles flanking home plate) */}
          <rect x="174" y="298" width="14" height="22" fill="none" stroke="#fff" strokeWidth="1" opacity="0.4" />
          <rect x="212" y="298" width="14" height="22" fill="none" stroke="#fff" strokeWidth="1" opacity="0.4" />

          {/* Catcher's box behind the plate */}
          <path d="M 188 318 Q 200 332 212 318" fill="none" stroke="#fff" strokeWidth="1" opacity="0.4" />

          {/* On-deck circles (visual flair) */}
          <circle cx="135" cy="336" r="9" fill="none" stroke="#fff" strokeWidth="1" opacity="0.3" />
          <circle cx="265" cy="336" r="9" fill="none" stroke="#fff" strokeWidth="1" opacity="0.3" />

          {/* Pitcher marker (tiny circle on the mound, hat-tip to the player figure) */}
          <circle cx="200" cy="244" r="3.5" fill="#1a1a1a" stroke="#fff" strokeWidth="0.8" />

          {/* Batter marker (small circle in the appropriate box, depending on handedness) */}
          {d.batter && (
            <circle
              cx={d.batter.bats === 'L' ? 219 : 181}
              cy={310}
              r={3.2}
              fill="#1a1a1a"
              stroke="#fff"
              strokeWidth="0.8"
            />
          )}

          {/* Inning indicator at bottom */}
          <text x="200" y="392" textAnchor="middle" fill="var(--ink-muted)" fontSize="11" fontFamily="ui-monospace">
            {d.inningState} {d.inning}
            {ord(d.inning)}
          </text>
        </svg>

        {/* Runner name chips overlaid on bases */}
        <div className="absolute inset-0 pointer-events-none">
          {d.first && <RunnerLabel x={264} y={246} name={d.first.name} id={d.first.id} side="right" />}
          {d.second && <RunnerLabel x={200} y={182} name={d.second.name} id={d.second.id} side="top" />}
          {d.third && <RunnerLabel x={136} y={246} name={d.third.name} id={d.third.id} side="left" />}
        </div>
      </div>

      {/* Right side: count, outs, matchup, due up */}
      <div className="space-y-4">
        {/* Count + outs */}
        <div className="grid grid-cols-3 gap-3">
          <CountTile label="Balls" current={d.balls} max={4} accent="info" />
          <CountTile label="Strikes" current={d.strikes} max={3} accent="warn" />
          <CountTile label="Outs" current={d.outs} max={3} accent="neg" />
        </div>

        {/* Matchup */}
        <div className="px-4 py-3 rounded border border-line bg-bg-raised">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label-micro">Pitching · {pitchingTeam}</div>
              {d.pitcher ? (
                <Link href={`/player/${d.pitcher.id}`} className="text-base font-medium text-ink hover:text-accent block">
                  {d.pitcher.name}
                </Link>
              ) : <div className="text-sm text-ink-muted">—</div>}
              <div className="text-2xs text-ink-faint stat-num mt-0.5">
                {d.pitcher?.throws ? `${d.pitcher.throws}HP` : ''}
                {d.pitcher?.pitchesThrown !== undefined ? ` · ${d.pitcher.pitchesThrown} P thrown` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="label-micro">At bat · {battingTeam}</div>
              {d.batter ? (
                <Link href={`/player/${d.batter.id}`} className="text-base font-medium text-ink hover:text-accent block">
                  {d.batter.name}
                </Link>
              ) : <div className="text-sm text-ink-muted">—</div>}
              <div className="text-2xs text-ink-faint stat-num mt-0.5">{d.batter?.bats ? `bats ${d.batter.bats}` : ''}</div>
            </div>
          </div>
        </div>

        {/* Due up */}
        {(d.onDeck || d.inHole) && (
          <div className="px-4 py-2.5 rounded border border-line">
            <div className="label-micro mb-1.5">Due up</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {d.onDeck && (
                <div>
                  <div className="text-2xs text-ink-faint">On deck</div>
                  <Link href={`/player/${d.onDeck.id}`} className="text-ink hover:text-accent">{d.onDeck.name}</Link>
                </div>
              )}
              {d.inHole && (
                <div>
                  <div className="text-2xs text-ink-faint">In the hole</div>
                  <Link href={`/player/${d.inHole.id}`} className="text-ink hover:text-accent">{d.inHole.name}</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Base({ x, y, occupied }: { x: number; y: number; occupied: boolean; highlight?: boolean }) {
  // Real bases: white square, slightly tilted 45° so corners point along the basepaths
  return (
    <g>
      {/* Subtle shadow */}
      <rect
        x={x - 8}
        y={y - 8 + 1.5}
        width={16}
        height={16}
        transform={`rotate(45 ${x} ${y + 1.5})`}
        fill="#000"
        opacity="0.25"
      />
      <rect
        x={x - 8}
        y={y - 8}
        width={16}
        height={16}
        transform={`rotate(45 ${x} ${y})`}
        fill={occupied ? '#facc15' : '#fff'}
        stroke={occupied ? '#a3850f' : '#cdcdcd'}
        strokeWidth="1"
      />
    </g>
  );
}

function RunnerLabel({ x, y, name, id, side }: { x: number; y: number; name: string; id: number; side: 'left' | 'right' | 'top' }) {
  // Convert SVG coords (out of 400) to percent
  const left = `${(x / 400) * 100}%`;
  const top = `${(y / 400) * 100}%`;
  // Position the chip outside the diamond so it doesn't cover the base
  const offset = side === 'top' ? { marginTop: -28 } : side === 'left' ? { marginLeft: -42, marginTop: -2 } : { marginLeft: 42, marginTop: -2 };
  return (
    <Link
      href={`/player/${id}`}
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-bg-sunken border border-accent text-2xs stat-num text-accent hover:bg-accent hover:text-bg whitespace-nowrap shadow-md"
      style={{ left, top, ...offset }}
      title={name}
    >
      {abbreviateName(name)}
    </Link>
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

function abbreviateName(name: string): string {
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function CountTile({
  label,
  current,
  max,
  accent,
}: {
  label: string;
  current: number;
  max: number;
  accent: 'info' | 'warn' | 'neg';
}) {
  const cls =
    accent === 'info' ? 'bg-signal-info' :
    accent === 'warn' ? 'bg-signal-warn' :
    'bg-signal-neg';
  return (
    <div className="px-3 py-2.5 rounded border border-line bg-bg-raised">
      <div className="label-micro mb-1.5">{label}</div>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              i < current ? cls : 'bg-bg-sunken border border-line'
            }`}
          />
        ))}
        <span className="ml-auto stat-num text-base font-semibold text-ink">{current}</span>
      </div>
    </div>
  );
}
