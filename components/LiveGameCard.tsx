import Link from 'next/link';
import { Badge } from './ui/Badge';
import { Sparkline } from './ui/Sparkline';
import { teamCapLogoUrl, playerHeadshotUrl } from '@/lib/mlb';

export type LiveGameCardData = {
  gamePk: number;
  home: { id: number; name: string; abbr: string; score: number; record?: string };
  away: { id: number; name: string; abbr: string; score: number; record?: string };
  inning: number | null;
  inningState: string;
  isTopInning: boolean;
  outs: number;
  balls: number;
  strikes: number;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  currentBatter?: { id: number; name: string; pos?: string };
  currentPitcher?: { id: number; name: string; throws?: string };
  homeWP: number | null;
  wpSeries: number[];
  lastPlay?: string;
  venue?: string;
};

/**
 * Live game card — emphasizes what's happening RIGHT NOW. Score header,
 * mini field viz with bases + count + outs, big PIT vs BAT matchup with
 * headshots, live WP, last play. Refreshes every 5s with the parent page.
 */
export function LiveGameCard({ d }: { d: LiveGameCardData }) {
  const homeLeading = d.home.score > d.away.score;
  const awayLeading = d.away.score > d.home.score;
  const homeWPPct = d.homeWP !== null ? d.homeWP * 100 : null;
  const awayWPPct = homeWPPct !== null ? 100 - homeWPPct : null;

  return (
    <article className="panel overflow-hidden flex flex-col">
      {/* Score header — clean two-row layout with team logos */}
      <header className="px-4 pt-3 pb-2 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="neg" pulse>LIVE</Badge>
            <span className="text-2xs text-ink-muted stat-num font-medium">
              {d.inningState} {d.inning ? `${d.inning}${ord(d.inning)}` : ''}
            </span>
          </div>
          <Link href={`/game/${d.gamePk}`} className="text-2xs text-ink-muted hover:text-ink uppercase tracking-micro">
            full game →
          </Link>
        </div>

        {/* Team rows with score */}
        <div className="space-y-1.5">
          <TeamScoreRow team={d.away} dim={homeLeading} batting={d.isTopInning} />
          <TeamScoreRow team={d.home} dim={awayLeading} batting={!d.isTopInning} />
        </div>
      </header>

      {/* Field + count/outs — the "right now" visual */}
      <div className="px-4 pt-3 pb-2 grid grid-cols-[auto_1fr] gap-3 items-center bg-bg-raised/40 border-b border-line">
        <MiniField
          first={d.onFirst}
          second={d.onSecond}
          third={d.onThird}
          isTopInning={d.isTopInning}
        />
        <div className="space-y-1">
          <CountRow label="B" current={d.balls} max={4} color="#16a34a" />
          <CountRow label="S" current={d.strikes} max={3} color="#dc2626" />
          <CountRow label="O" current={d.outs} max={3} color="#737373" />
        </div>
      </div>

      {/* Pitcher → Batter matchup with headshots */}
      {(d.currentPitcher || d.currentBatter) && (
        <div className="px-4 py-3 grid grid-cols-[1fr_auto_1fr] gap-3 items-center border-b border-line">
          {d.currentPitcher ? (
            <Link href={`/player/${d.currentPitcher.id}`} className="flex items-center gap-2 min-w-0 hover:text-accent">
              <img
                src={playerHeadshotUrl(d.currentPitcher.id, 80)}
                alt=""
                className="w-9 h-9 rounded-full bg-bg-raised object-cover border border-line shrink-0"
              />
              <div className="min-w-0">
                <div className="label-micro">PITCHER</div>
                <div className="text-sm font-semibold text-ink truncate">{abbreviateName(d.currentPitcher.name)}</div>
              </div>
            </Link>
          ) : <div />}
          <span className="text-2xs text-ink-faint stat-num">vs</span>
          {d.currentBatter ? (
            <Link href={`/player/${d.currentBatter.id}`} className="flex items-center justify-end gap-2 min-w-0 hover:text-accent text-right">
              <div className="min-w-0">
                <div className="label-micro flex justify-end">BATTER</div>
                <div className="text-sm font-semibold text-ink truncate">{abbreviateName(d.currentBatter.name)}</div>
              </div>
              <img
                src={playerHeadshotUrl(d.currentBatter.id, 80)}
                alt=""
                className="w-9 h-9 rounded-full bg-bg-raised object-cover border border-line shrink-0"
              />
            </Link>
          ) : <div />}
        </div>
      )}

      {/* Win probability bar with sparkline */}
      {homeWPPct !== null && (
        <div className="px-4 py-2.5 border-b border-line">
          <div className="flex items-center justify-between text-2xs mb-1.5">
            <span className="stat-num text-ink-muted">
              {d.away.abbr} <span className="text-ink font-semibold">{awayWPPct!.toFixed(0)}%</span>
            </span>
            <span className="label-micro text-ink-faint">live WP</span>
            <span className="stat-num text-ink-muted">
              <span className="text-ink font-semibold">{homeWPPct.toFixed(0)}%</span> {d.home.abbr}
            </span>
          </div>
          <div className="h-1.5 rounded overflow-hidden bg-bg-sunken flex">
            <div className="h-full bg-signal-neg" style={{ width: `${awayWPPct}%` }} />
            <div className="h-full bg-signal-pos" style={{ width: `${homeWPPct}%` }} />
          </div>
          {d.wpSeries.length > 3 && (
            <div className="mt-1.5">
              <Sparkline values={d.wpSeries} width={280} height={22} positive />
            </div>
          )}
        </div>
      )}

      {/* Last play strip */}
      {d.lastPlay && (
        <div className="px-4 py-2 mt-auto text-2xs text-ink-muted">
          <span className="label-micro mr-2">LAST</span>
          <span className="line-clamp-2">{d.lastPlay}</span>
        </div>
      )}
    </article>
  );
}

function TeamScoreRow({
  team,
  dim,
  batting,
}: {
  team: LiveGameCardData['away'];
  dim?: boolean;
  batting?: boolean;
}) {
  return (
    <Link
      href={`/team/${team.id}`}
      className={`flex items-center gap-2 ${dim ? 'opacity-50' : ''}`}
    >
      <img src={teamCapLogoUrl(team.id)} alt="" className="w-6 h-6 team-logo opacity-95 shrink-0" />
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span className="text-base font-semibold truncate">{team.abbr}</span>
        <span className="text-2xs text-ink-faint truncate hidden sm:inline">{team.name}</span>
        {batting && <span className="text-xs text-accent">●</span>}
      </div>
      {team.record && <span className="text-2xs text-ink-faint stat-num">{team.record}</span>}
      <span className="stat-num text-2xl font-bold w-8 text-right">{team.score}</span>
    </Link>
  );
}

function MiniField({
  first,
  second,
  third,
  isTopInning,
}: {
  first: boolean;
  second: boolean;
  third: boolean;
  isTopInning: boolean;
}) {
  // Compact realistic field rendered in 96x96
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
      <defs>
        <radialGradient id="miniGrass" cx="50%" cy="100%" r="120%">
          <stop offset="0%" stopColor="#3a7a3a" />
          <stop offset="100%" stopColor="#1f4f1f" />
        </radialGradient>
      </defs>
      {/* Outfield sector */}
      <path d="M 48 78 L 8 38 A 56 56 0 0 1 88 38 Z" fill="url(#miniGrass)" />
      {/* Infield dirt */}
      <circle cx="48" cy="60" r="26" fill="#8b6f47" />
      {/* Infield diamond grass */}
      <polygon points="48,78 64,62 48,46 32,62" fill="#357535" stroke="#fff" strokeWidth="0.8" strokeOpacity="0.7" />
      {/* Pitcher's mound */}
      <circle cx="48" cy="62" r="4.5" fill="#a17a4d" />
      <rect x="46" y="60.5" width="4" height="1.2" fill="#fff" />
      {/* Bases */}
      <rect x={64 - 3} y={62 - 3} width="6" height="6" transform="rotate(45 64 62)" fill={first ? '#facc15' : '#fff'} stroke={first ? '#a3850f' : '#cdcdcd'} strokeWidth="0.5" />
      <rect x={48 - 3} y={46 - 3} width="6" height="6" transform="rotate(45 48 46)" fill={second ? '#facc15' : '#fff'} stroke={second ? '#a3850f' : '#cdcdcd'} strokeWidth="0.5" />
      <rect x={32 - 3} y={62 - 3} width="6" height="6" transform="rotate(45 32 62)" fill={third ? '#facc15' : '#fff'} stroke={third ? '#a3850f' : '#cdcdcd'} strokeWidth="0.5" />
      {/* Home plate */}
      <polygon points="48,82 44,78 44,75 52,75 52,78" fill="#fff" stroke="#222" strokeWidth="0.4" />
    </svg>
  );
}

function CountRow({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-micro w-3 stat-num">{label}</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              background: i < current ? color : 'transparent',
              border: i < current ? `1px solid ${color}` : '1px solid var(--line-strong)',
            }}
          />
        ))}
      </div>
      <span className="ml-auto text-2xs stat-num text-ink-muted">{current}</span>
    </div>
  );
}

function abbreviateName(name: string): string {
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function ord(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
