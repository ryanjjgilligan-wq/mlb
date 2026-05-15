import Link from 'next/link';
import { playerHeadshotUrl, teamCapLogoUrl } from '@/lib/mlb';

export type LiveMatchupCardData = {
  pitcher?: {
    id: number;
    name: string;
    teamId: number;
    throws?: string; // 'L' | 'R'
    inningsPitched?: string;
    hits?: number;
    earnedRuns?: number;
    strikeOuts?: number;
    baseOnBalls?: number;
    numberOfPitches?: number;
  };
  batter?: {
    id: number;
    name: string;
    teamId: number;
    position?: string; // e.g. 'RF', 'CF', 'DH'
    bats?: string;
    atBats?: number;
    hits?: number;
  };
  onDeck?: { id: number; name: string };
};

/**
 * Pitcher vs Batter matchup card. Mirrors the iconic broadcast scoreboard
 * graphic: headshots flanking a "vs" with the current at-bat line below
 * each player, plus the pitcher's pitch count and the on-deck batter.
 */
export function LiveMatchupCard({ d }: { d: LiveMatchupCardData }) {
  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* Pitcher side */}
        <PlayerSide
          role="PITCHER"
          align="left"
          player={d.pitcher && {
            id: d.pitcher.id,
            name: d.pitcher.name,
            teamId: d.pitcher.teamId,
            posLabel: d.pitcher.throws ? `${d.pitcher.throws}HP` : '',
          }}
          line={
            d.pitcher
              ? formatPitcherLine(d.pitcher)
              : '—'
          }
        />

        {/* vs separator */}
        <div className="text-2xs uppercase tracking-micro font-semibold text-ink-muted">vs</div>

        {/* Batter side */}
        <PlayerSide
          role="BATTER"
          align="right"
          player={d.batter && {
            id: d.batter.id,
            name: d.batter.name,
            teamId: d.batter.teamId,
            posLabel: d.batter.position ?? '',
          }}
          line={
            d.batter
              ? formatBatterLine(d.batter)
              : '—'
          }
        />
      </div>

      {/* Footer strip with pitch count + on deck */}
      <div className="mt-3 pt-3 border-t border-line-subtle grid grid-cols-2 gap-4 text-2xs">
        <div className="flex items-center gap-2">
          <span className="label-micro">Pitch count</span>
          <span className="stat-num text-base font-semibold text-ink">
            {d.pitcher?.numberOfPitches ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="label-micro shrink-0">On deck</span>
          {d.onDeck ? (
            <Link
              href={`/player/${d.onDeck.id}`}
              className="stat-num text-base font-semibold text-ink hover:text-accent truncate"
            >
              {abbreviateName(d.onDeck.name)}
            </Link>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerSide({
  role,
  align,
  player,
  line,
}: {
  role: 'PITCHER' | 'BATTER';
  align: 'left' | 'right';
  player?: { id: number; name: string; teamId: number; posLabel: string };
  line: string;
}) {
  const isLeft = align === 'left';
  return (
    <div className={`flex items-start gap-3 ${isLeft ? '' : 'flex-row-reverse text-right'}`}>
      {/* Headshot with team-cap badge overlay */}
      <div className="relative shrink-0">
        {player ? (
          <Link href={`/player/${player.id}`} className="block">
            <img
              src={playerHeadshotUrl(player.id, 120)}
              alt={player.name}
              className="w-14 h-14 rounded-full bg-bg-raised object-cover border border-line"
            />
            <img
              src={teamCapLogoUrl(player.teamId)}
              alt=""
              className={`absolute w-6 h-6 -bottom-1 ${isLeft ? '-right-1' : '-left-1'} team-logo opacity-95 bg-bg-panel rounded-full p-0.5 border border-line`}
            />
          </Link>
        ) : (
          <div className="w-14 h-14 rounded-full bg-bg-raised border border-line flex items-center justify-center">
            <span className="text-2xs text-ink-faint">—</span>
          </div>
        )}
      </div>

      {/* Name + role + position + line */}
      <div className="min-w-0 flex-1">
        <div className={`label-micro ${isLeft ? '' : 'flex justify-end'}`}>{role}</div>
        {player ? (
          <div className={`flex items-baseline gap-1.5 ${isLeft ? '' : 'flex-row-reverse'}`}>
            <Link
              href={`/player/${player.id}`}
              className="text-sm font-semibold text-ink hover:text-accent truncate"
            >
              {abbreviateName(player.name)}
            </Link>
            {player.posLabel && (
              <span className="text-2xs text-ink-muted stat-num">{player.posLabel}</span>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink-faint">TBD</div>
        )}
        <div className={`text-2xs text-ink-muted stat-num mt-0.5 truncate ${isLeft ? '' : 'text-right'}`}>
          {line}
        </div>
      </div>
    </div>
  );
}

function formatPitcherLine(p: NonNullable<LiveMatchupCardData['pitcher']>): string {
  const parts: string[] = [];
  if (p.inningsPitched != null) parts.push(`${p.inningsPitched} IP`);
  if (p.hits !== undefined) parts.push(`${p.hits} H`);
  if (p.earnedRuns !== undefined) parts.push(`${p.earnedRuns} ER`);
  if (p.strikeOuts !== undefined) parts.push(`${p.strikeOuts} K`);
  if (p.baseOnBalls !== undefined) parts.push(`${p.baseOnBalls} BB`);
  return parts.join(', ') || '—';
}

function formatBatterLine(b: NonNullable<LiveMatchupCardData['batter']>): string {
  const ab = b.atBats ?? 0;
  const h = b.hits ?? 0;
  return `${h}-${ab}`;
}

function abbreviateName(name: string): string {
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}
