import Link from 'next/link';
import { Badge } from './ui/Badge';
import type { ScheduleGame } from '@/lib/mlb';
import { teamCapLogoUrl } from '@/lib/mlb';
import { LocalTime } from './LocalTime';
import { Countdown } from './Countdown';

export function GameRow({ game }: { game: ScheduleGame }) {
  const state = game.status.abstractGameState; // Preview | Live | Final
  const isLive = state === 'Live';
  const isFinal = state === 'Final';
  const isPreview = state === 'Preview';

  const away = game.teams.away;
  const home = game.teams.home;
  const ls = game.linescore;

  const awayWin = isFinal && (away.score ?? 0) > (home.score ?? 0);
  const homeWin = isFinal && (home.score ?? 0) > (away.score ?? 0);

  return (
    <Link
      href={`/game/${game.gamePk}`}
      className="block panel-flush row-hover rounded-md px-3 py-2.5 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <TeamLine team={away} dim={!isPreview && !awayWin && isFinal} />
          <TeamLine team={home} dim={!isPreview && !homeWin && isFinal} />
        </div>
        <div className="text-right shrink-0 min-w-[88px]">
          {isPreview && (
            <>
              <LocalTime iso={game.gameDate} format="time" className="text-2xs text-ink-muted stat-num block" />
              <Countdown iso={game.gameDate} status="Preview" className="block" />
              {game.venue?.name && (
                <div className="text-2xs text-ink-faint truncate max-w-[110px]">{game.venue.name}</div>
              )}
            </>
          )}
          {isLive && (
            <>
              <Badge variant="neg" pulse className="mb-1">LIVE</Badge>
              <div className="text-2xs text-ink-muted">
                {ls?.inningState ?? ''} {ls?.currentInning ?? ''}
              </div>
              <div className="text-2xs text-ink-faint">
                {ls?.outs ?? 0} out · {ls?.balls ?? 0}-{ls?.strikes ?? 0}
              </div>
            </>
          )}
          {isFinal && (
            <div className="text-2xs text-ink-muted">
              {game.status.detailedState === 'Final' ? 'FINAL' : game.status.detailedState.toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function TeamLine({
  team,
  dim,
}: {
  team: ScheduleGame['teams']['away'];
  dim?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${dim ? 'opacity-60' : ''}`}>
      <img
        src={teamCapLogoUrl(team.team.id)}
        alt=""
        className="w-5 h-5 team-logo opacity-90"
        loading="lazy"
      />
      <span className="text-sm font-medium truncate flex-1">{team.team.name}</span>
      {team.leagueRecord && (
        <span className="text-2xs text-ink-faint stat-num">
          {team.leagueRecord.wins}-{team.leagueRecord.losses}
        </span>
      )}
      <span className="stat-num text-sm font-semibold w-6 text-right">
        {team.score !== undefined ? team.score : '·'}
      </span>
    </div>
  );
}
