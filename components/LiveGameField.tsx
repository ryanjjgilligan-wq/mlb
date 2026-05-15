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
      {/* The diamond */}
      <div className="relative mx-auto">
        <svg viewBox="0 0 320 320" width="300" height="300" className="block">
          {/* Outfield arc */}
          <path
            d="M 30 220 A 130 130 0 0 1 290 220"
            stroke="var(--line-strong)"
            strokeWidth="1.5"
            fill="var(--bg-sunken)"
            opacity="0.5"
          />
          {/* Foul lines */}
          <line x1="160" y1="220" x2="40" y2="100" stroke="var(--line)" strokeWidth="1.2" />
          <line x1="160" y1="220" x2="280" y2="100" stroke="var(--line)" strokeWidth="1.2" />
          {/* Infield diamond */}
          <polygon
            points="160,220 235,150 160,80 85,150"
            fill="var(--bg-raised)"
            stroke="var(--line-strong)"
            strokeWidth="1.5"
          />
          {/* Pitcher's mound */}
          <circle cx="160" cy="170" r="14" fill="var(--bg-panel)" stroke="var(--line-strong)" strokeWidth="1" />

          {/* Bases */}
          <Base x={160} y={220} occupied={false} label="HOME" />
          <Base x={235} y={150} occupied={!!d.first} label="1B" />
          <Base x={160} y={80} occupied={!!d.second} label="2B" />
          <Base x={85} y={150} occupied={!!d.third} label="3B" />

          {/* Inning state arrow */}
          <text x="160" y="304" textAnchor="middle" fill="var(--ink-muted)" fontSize="10" fontFamily="ui-monospace">
            {d.inningState} {d.inning}
            {d.inning === 1 ? 'st' : d.inning === 2 ? 'nd' : d.inning === 3 ? 'rd' : 'th'}
          </text>
        </svg>

        {/* Runner names overlaid */}
        <div className="absolute inset-0 pointer-events-none">
          {d.first && <RunnerLabel x={235} y={150} name={d.first.name} id={d.first.id} />}
          {d.second && <RunnerLabel x={160} y={80} name={d.second.name} id={d.second.id} />}
          {d.third && <RunnerLabel x={85} y={150} name={d.third.name} id={d.third.id} />}
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

function Base({ x, y, occupied, label }: { x: number; y: number; occupied: boolean; label: string }) {
  return (
    <g>
      <rect
        x={x - 11}
        y={y - 11}
        width={22}
        height={22}
        transform={`rotate(45 ${x} ${y})`}
        fill={occupied ? 'var(--accent)' : 'var(--bg-raised)'}
        stroke={occupied ? 'var(--accent)' : 'var(--line-strong)'}
        strokeWidth="1.5"
      />
      <text
        x={x}
        y={y + 28}
        textAnchor="middle"
        fill="var(--ink-faint)"
        fontSize="9"
        fontFamily="ui-monospace"
      >
        {label}
      </text>
    </g>
  );
}

function RunnerLabel({ x, y, name, id }: { x: number; y: number; name: string; id: number }) {
  // Convert SVG coords (out of 320) to percent
  const left = `${(x / 320) * 100}%`;
  const top = `${(y / 320) * 100}%`;
  return (
    <Link
      href={`/player/${id}`}
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-bg-sunken border border-accent text-2xs stat-num text-accent hover:bg-accent hover:text-bg whitespace-nowrap"
      style={{ left, top, marginTop: -22 }}
      title={name}
    >
      {abbreviateName(name)}
    </Link>
  );
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
