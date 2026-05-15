import Link from 'next/link';
import { Badge } from './ui/Badge';
import { Sparkline } from './ui/Sparkline';
import { teamCapLogoUrl } from '@/lib/mlb';

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

export function LiveGameCard({ d }: { d: LiveGameCardData }) {
  const homeLeading = d.home.score > d.away.score;
  const awayLeading = d.away.score > d.home.score;
  const homeWPPct = d.homeWP !== null ? d.homeWP * 100 : null;
  const awayWPPct = homeWPPct !== null ? 100 - homeWPPct : null;

  return (
    <article className="panel overflow-hidden">
      {/* Header strip */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-bg-raised">
        <div className="flex items-center gap-2">
          <Badge variant="neg" pulse>LIVE</Badge>
          <span className="text-2xs text-ink-muted stat-num">
            {d.inningState} {d.inning ? `${d.inning}${ord(d.inning)}` : ''}
          </span>
          <span className="text-2xs text-ink-faint">·</span>
          <span className="text-2xs text-ink-muted stat-num">{d.outs} out · {d.balls}-{d.strikes}</span>
        </div>
        <Link href={`/game/${d.gamePk}`} className="text-2xs text-ink-muted hover:text-ink uppercase tracking-micro">
          detail →
        </Link>
      </header>

      {/* Scoreboard */}
      <div className="px-3 py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
        <TeamRow team={d.away} dim={homeLeading} batting={d.isTopInning} pitcherSide={!d.isTopInning} />
        <ScoreCell value={d.away.score} highlight={awayLeading} />
        <TeamRow team={d.home} dim={awayLeading} batting={!d.isTopInning} pitcherSide={d.isTopInning} />
        <ScoreCell value={d.home.score} highlight={homeLeading} />
      </div>

      {/* Win prob bar */}
      {homeWPPct !== null && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between text-2xs mb-1">
            <span className="stat-num text-ink-muted">
              {d.away.abbr} <span className="text-ink font-medium">{awayWPPct!.toFixed(1)}%</span>
            </span>
            <span className="label-micro text-ink-faint">live WP</span>
            <span className="stat-num text-ink-muted">
              <span className="text-ink font-medium">{homeWPPct.toFixed(1)}%</span> {d.home.abbr}
            </span>
          </div>
          <div className="h-1.5 rounded overflow-hidden bg-bg-sunken flex">
            <div className="h-full bg-signal-neg" style={{ width: `${awayWPPct}%` }} />
            <div className="h-full bg-signal-pos" style={{ width: `${homeWPPct}%` }} />
          </div>
          {d.wpSeries.length > 3 && (
            <div className="mt-1">
              <Sparkline values={d.wpSeries} width={280} height={20} positive />
            </div>
          )}
        </div>
      )}

      {/* Matchup line */}
      {(d.currentBatter || d.currentPitcher) && (
        <div className="px-3 py-2 border-t border-line-subtle bg-bg-sunken/50 text-2xs text-ink-muted flex items-center gap-2 flex-wrap">
          {d.currentPitcher && (
            <Link href={`/player/${d.currentPitcher.id}`} className="hover:text-ink">
              <span className="label-micro">P</span> {d.currentPitcher.name}
            </Link>
          )}
          {d.currentPitcher && d.currentBatter && <span className="text-ink-faint">→</span>}
          {d.currentBatter && (
            <Link href={`/player/${d.currentBatter.id}`} className="hover:text-ink">
              <span className="label-micro">AB</span> {d.currentBatter.name}
            </Link>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <BaseDiamond first={d.onFirst} second={d.onSecond} third={d.onThird} />
          </span>
        </div>
      )}

      {/* Last play */}
      {d.lastPlay && (
        <div className="px-3 py-2 border-t border-line-subtle text-2xs text-ink-muted">
          <span className="label-micro mr-2">last</span>
          {d.lastPlay}
        </div>
      )}
    </article>
  );
}

function TeamRow({
  team,
  dim,
  batting,
}: {
  team: LiveGameCardData['away'];
  dim?: boolean;
  batting?: boolean;
  pitcherSide?: boolean;
}) {
  return (
    <Link href={`/team/${team.id}`} className={`flex items-center gap-2 min-w-0 ${dim ? 'opacity-60' : ''}`}>
      <img src={teamCapLogoUrl(team.id)} alt="" className="w-6 h-6 invert opacity-90 shrink-0" />
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium truncate">{team.name}</span>
        {batting && <span className="text-2xs text-accent">●</span>}
      </div>
      {team.record && <span className="text-2xs text-ink-faint stat-num ml-auto">{team.record}</span>}
    </Link>
  );
}

function ScoreCell({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <div className={`stat-num text-2xl font-semibold min-w-[2ch] text-right ${highlight ? 'text-ink' : 'text-ink-muted'}`}>
      {value}
    </div>
  );
}

function BaseDiamond({
  first,
  second,
  third,
}: {
  first: boolean;
  second: boolean;
  third: boolean;
}) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-label="bases">
      <g transform="translate(9 9) rotate(45) translate(-3 -3)">
        <rect x="6" y="-6" width="6" height="6" fill={first ? '#facc15' : 'none'} stroke="#3a3a42" strokeWidth="0.6" />
        <rect x="0" y="-12" width="6" height="6" fill={second ? '#facc15' : 'none'} stroke="#3a3a42" strokeWidth="0.6" />
        <rect x="-6" y="-6" width="6" height="6" fill={third ? '#facc15' : 'none'} stroke="#3a3a42" strokeWidth="0.6" />
      </g>
    </svg>
  );
}

function ord(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
