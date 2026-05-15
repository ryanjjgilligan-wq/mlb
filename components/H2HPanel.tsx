import Link from 'next/link';
import { Badge } from './ui/Badge';
import { teamCapLogoUrl, type ScheduleGame } from '@/lib/mlb';

export function H2HPanel({
  games,
  homeId,
  awayId,
  homeName,
  awayName,
  season,
  priorSeason,
}: {
  games: ScheduleGame[];
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  season: number;
  priorSeason?: { games: ScheduleGame[]; season: number };
}) {
  const finals = games.filter((g) => g.status.abstractGameState === 'Final');
  const upcoming = games.filter((g) => g.status.abstractGameState === 'Preview');

  // Count from each side's perspective (games are home-team-relative in the API
  // when teamId=A&opponentId=B; "home" = A's home, "away" = B at A's place).
  let awayWins = 0;
  let homeWins = 0;
  let runsAway = 0;
  let runsHome = 0;
  for (const g of finals) {
    const aScore = g.teams.away.score ?? 0;
    const hScore = g.teams.home.score ?? 0;
    if (g.teams.away.team.id === awayId && g.teams.home.team.id === homeId) {
      runsAway += aScore; runsHome += hScore;
      if (aScore > hScore) awayWins++; else homeWins++;
    } else if (g.teams.away.team.id === homeId && g.teams.home.team.id === awayId) {
      runsHome += aScore; runsAway += hScore;
      if (aScore > hScore) homeWins++; else awayWins++;
    }
  }

  const priorFinals = (priorSeason?.games ?? []).filter((g) => g.status.abstractGameState === 'Final');
  let priorAwayWins = 0;
  let priorHomeWins = 0;
  for (const g of priorFinals) {
    const aScore = g.teams.away.score ?? 0;
    const hScore = g.teams.home.score ?? 0;
    if (g.teams.away.team.id === awayId && g.teams.home.team.id === homeId) {
      if (aScore > hScore) priorAwayWins++; else priorHomeWins++;
    } else if (g.teams.away.team.id === homeId && g.teams.home.team.id === awayId) {
      if (aScore > hScore) priorHomeWins++; else priorAwayWins++;
    }
  }

  return (
    <div>
      {finals.length === 0 && upcoming.length === 0 && (
        <div className="px-3 py-6 text-2xs text-ink-faint text-center">
          No matchups scheduled this season between these clubs.
        </div>
      )}

      {finals.length > 0 && (
        <div className="px-4 py-3 border-b border-line-subtle grid grid-cols-3 gap-3 items-center text-center">
          <div>
            <img src={teamCapLogoUrl(awayId)} alt="" className="w-6 h-6 mx-auto team-logo opacity-90" />
            <div className="text-2xs text-ink-muted truncate mt-1">{awayName}</div>
            <div className="stat-num text-2xl font-semibold mt-0.5">{awayWins}</div>
            {priorSeason && (
              <div className="text-2xs text-ink-faint stat-num mt-1">
                {priorSeason.season}: <span className={priorAwayWins > priorHomeWins ? 'text-signal-pos' : ''}>{priorAwayWins}</span>
              </div>
            )}
          </div>
          <div className="text-2xs text-ink-faint">
            <div className="label-micro">{season} series</div>
            <div className="text-sm text-ink-muted mt-1">{finals.length} of {finals.length + upcoming.length}</div>
            <div className="stat-num mt-1">{runsAway}–{runsHome}</div>
            <div className="text-2xs mt-0.5">total runs</div>
          </div>
          <div>
            <img src={teamCapLogoUrl(homeId)} alt="" className="w-6 h-6 mx-auto team-logo opacity-90" />
            <div className="text-2xs text-ink-muted truncate mt-1">{homeName}</div>
            <div className="stat-num text-2xl font-semibold mt-0.5">{homeWins}</div>
            {priorSeason && (
              <div className="text-2xs text-ink-faint stat-num mt-1">
                {priorSeason.season}: <span className={priorHomeWins > priorAwayWins ? 'text-signal-pos' : ''}>{priorHomeWins}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {finals.length > 0 && (
        <div>
          <div className="px-3 py-2 label-micro">Recent meetings</div>
          <ul className="divide-y divide-line-subtle">
            {finals.slice(0, 5).map((g) => {
              const winnerIsAway = (g.teams.away.score ?? 0) > (g.teams.home.score ?? 0);
              return (
                <li key={g.gamePk}>
                  <Link href={`/game/${g.gamePk}`} className="flex items-center gap-2 px-3 py-1.5 row-hover text-sm">
                    <span className="text-2xs text-ink-faint stat-num w-12">{g.gameDate.slice(5, 10)}</span>
                    <img src={teamCapLogoUrl(g.teams.away.team.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                    <span className={`flex-1 truncate ${winnerIsAway ? 'text-ink' : 'text-ink-muted'}`}>{(g.teams.away.team as any).abbreviation ?? g.teams.away.team.name}</span>
                    <span className={`stat-num font-semibold w-5 text-right ${winnerIsAway ? 'text-ink' : 'text-ink-muted'}`}>{g.teams.away.score}</span>
                    <span className="text-2xs text-ink-faint">·</span>
                    <span className={`stat-num font-semibold w-5 text-right ${!winnerIsAway ? 'text-ink' : 'text-ink-muted'}`}>{g.teams.home.score}</span>
                    <span className={`flex-1 truncate ${!winnerIsAway ? 'text-ink' : 'text-ink-muted'}`}>{(g.teams.home.team as any).abbreviation ?? g.teams.home.team.name}</span>
                    <img src={teamCapLogoUrl(g.teams.home.team.id)} alt="" className="w-4 h-4 team-logo opacity-80" />
                    {g.venue?.name && <span className="text-2xs text-ink-faint truncate hidden lg:inline w-24 text-right">{g.venue.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="border-t border-line-subtle">
          <div className="px-3 py-2 label-micro">Upcoming this season</div>
          <ul className="divide-y divide-line-subtle">
            {upcoming.slice(0, 4).map((g) => (
              <li key={g.gamePk}>
                <Link href={`/game/${g.gamePk}`} className="flex items-center gap-2 px-3 py-1.5 row-hover text-2xs">
                  <span className="stat-num text-ink-muted w-14">{g.gameDate.slice(5, 10)}</span>
                  <span className="text-ink-muted">{(g.teams.away.team as any).abbreviation ?? g.teams.away.team.name} @ {(g.teams.home.team as any).abbreviation ?? g.teams.home.team.name}</span>
                  <Badge variant="info" className="ml-auto">UP</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
