import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getGameLive,
  getGameWinProbability,
  getStandings,
  getPlayerSplits,
  teamCapLogoUrl,
  playerHeadshotUrl,
} from '@/lib/mlb';
import { Panel } from '@/components/ui/Panel';
import { Stat } from '@/components/ui/Stat';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { WinProbChart, type WPPoint } from '@/components/WinProbChart';
import { LeverageChart, type LeveragePoint } from '@/components/LeverageChart';
import { pythagorean, fmtAvg } from '@/lib/saber';
import { preGameHomeWP } from '@/lib/winprob';
import { formatGameTime } from '@/lib/time';

export const revalidate = 15;

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Game ${params.id}` };
}

export default async function GamePage({ params }: { params: { id: string } }) {
  const gamePk = parseInt(params.id, 10);
  if (!gamePk) notFound();

  const [live, wpHistory, standings] = await Promise.all([
    getGameLive(gamePk).catch(() => null),
    getGameWinProbability(gamePk).catch(() => []),
    getStandings().catch(() => []),
  ]);

  if (!live) notFound();

  const gameData = live.gameData;
  const liveData = live.liveData;
  const status = gameData?.status?.abstractGameState as string;
  const isPreview = status === 'Preview';
  const isLive = status === 'Live';
  const isFinal = status === 'Final';

  const away = gameData.teams.away;
  const home = gameData.teams.home;
  const linescore = liveData?.linescore;
  const boxscore = liveData?.boxscore;
  const innings = linescore?.innings ?? [];

  const awayProbable = gameData.probablePitchers?.away;
  const homeProbable = gameData.probablePitchers?.home;

  // Lineup vs. opposing-handedness matchup: pull each likely batter's split
  // line against the opposing starter's pitching hand.
  const boxscoreEarly = liveData?.boxscore;
  const awayBatters: number[] = (boxscoreEarly?.teams?.away?.battingOrder ?? boxscoreEarly?.teams?.away?.batters ?? []).slice(0, 9);
  const homeBatters: number[] = (boxscoreEarly?.teams?.home?.battingOrder ?? boxscoreEarly?.teams?.home?.batters ?? []).slice(0, 9);
  const awayStartHand = (awayProbable?.pitchHand?.code ?? '').toUpperCase(); // L or R
  const homeStartHand = (homeProbable?.pitchHand?.code ?? '').toUpperCase();

  async function pullMatchups(batters: number[], oppHand: string) {
    if (!batters.length || !oppHand) return [];
    const sit = oppHand === 'L' ? 'vl' : 'vr';
    return Promise.all(batters.map(async (bid) => {
      const splits = await getPlayerSplits(bid, 'hitting').catch(() => []);
      const found = splits.find((sp: any) => sp.split?.code === sit);
      return { batterId: bid, split: found, fullName: boxscoreEarly?.teams?.away?.players?.[`ID${bid}`]?.person?.fullName
        ?? boxscoreEarly?.teams?.home?.players?.[`ID${bid}`]?.person?.fullName
        ?? '' };
    }));
  }

  const [awayVsHome, homeVsAway] = await Promise.all([
    pullMatchups(awayBatters, homeStartHand),
    pullMatchups(homeBatters, awayStartHand),
  ]);

  const awayRec = standings.flatMap((d) => d.teamRecords).find((tr) => tr.team.id === away.id);
  const homeRec = standings.flatMap((d) => d.teamRecords).find((tr) => tr.team.id === home.id);

  const awayPyth = awayRec ? pythagorean(awayRec.runsScored ?? 0, awayRec.runsAllowed ?? 0) : 0.5;
  const homePyth = homeRec ? pythagorean(homeRec.runsScored ?? 0, homeRec.runsAllowed ?? 0) : 0.5;
  const { homeWP, confidence } = preGameHomeWP(0, 0, homePyth, awayPyth);

  // Transform live WP series into chart points
  const wpPoints: WPPoint[] = (wpHistory ?? []).map((p: any, i: number) => ({
    idx: i,
    inning: p.about?.inning ?? 0,
    half: p.about?.halfInning === 'top' ? 'top' : 'bot',
    homeWP: typeof p.homeTeamWinProbability === 'number'
      ? p.homeTeamWinProbability / 100
      : 0.5,
    desc: p.result?.description ?? p.about?.halfInning + ' ' + (p.about?.inning ?? ''),
  }));

  // Derive leverage events from WP swings — top swings by absolute WPA
  const leverageAll: LeveragePoint[] = [];
  for (let i = 1; i < wpPoints.length; i++) {
    const wpa = wpPoints[i].homeWP - wpPoints[i - 1].homeWP;
    leverageAll.push({
      idx: i,
      inning: wpPoints[i].inning,
      wpa,
      abs: Math.abs(wpa),
      desc: wpPoints[i].desc,
    });
  }
  const topLeverage = [...leverageAll]
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 12)
    .sort((a, b) => a.idx - b.idx)
    .map((p, i) => ({ ...p, idx: i }));

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="panel p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {isLive && <Badge variant="neg" pulse>LIVE</Badge>}
            {isFinal && <Badge>FINAL</Badge>}
            {isPreview && <Badge variant="info">PREVIEW</Badge>}
            <span className="text-2xs text-ink-muted stat-num">
              {gameData.datetime?.dateTime ? formatGameTime(gameData.datetime.dateTime) : ''}
            </span>
            <span className="text-2xs text-ink-faint">·</span>
            <span className="text-2xs text-ink-muted">{gameData.venue?.name}</span>
          </div>
          <span className="text-2xs text-ink-faint">Game {gamePk}</span>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamColumn team={away} score={linescore?.teams?.away?.runs} side="away" />
          <div className="text-center min-w-[120px]">
            {isPreview ? (
              <>
                <div className="label-micro">First pitch</div>
                <div className="stat-num text-2xl font-semibold mt-1">
                  {gameData.datetime?.dateTime ? formatGameTime(gameData.datetime.dateTime) : '—'}
                </div>
              </>
            ) : (
              <>
                <div className="label-micro">{linescore?.inningState ?? gameData.status?.detailedState}</div>
                <div className="stat-num text-2xl font-semibold mt-1">
                  {linescore?.currentInning ? `${linescore.currentInning}${ord(linescore.currentInning)}` : '—'}
                </div>
                {isLive && (
                  <div className="text-2xs text-ink-muted mt-1 stat-num">
                    {linescore?.outs ?? 0} out · {linescore?.balls ?? 0}-{linescore?.strikes ?? 0}
                  </div>
                )}
              </>
            )}
          </div>
          <TeamColumn team={home} score={linescore?.teams?.home?.runs} side="home" reverse />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Pre-game projection (always shown, marked clearly) */}
        <Panel
          className="lg:col-span-5"
          title="Pre-game projection"
          subtitle="Log5 baseline · Pythagorean talent + home-field"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ProjBar label={away.teamName} pct={1 - homeWP} dim={away.id !== home.id} />
              <ProjBar label={home.teamName} pct={homeWP} accent />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-line-subtle">
              <Stat label="Home WP" value={`${(homeWP * 100).toFixed(1)}%`} size="sm" />
              <Stat label="Confidence" value={confidence} size="sm" hint="Heuristic: based on talent gap. For tighter intervals we'd need feature-rich logistic / XGBoost." />
              <Stat label="Method" value="Log5+HF" size="sm" hint="Bill James Log5 on Pythagorean expected W%, with a 54% home-field multiplier applied via odds ratio." />
            </div>
            <p className="text-2xs text-ink-faint">
              Transparent baseline model. See <Link href="/lab" className="underline hover:text-ink">Model Lab</Link> for assumptions, limitations, and planned upgrades.
            </p>
          </div>
        </Panel>

        {/* Win probability chart (live or final) */}
        <Panel
          className="lg:col-span-7"
          title="Live win probability"
          subtitle={
            wpPoints.length
              ? `${wpPoints.length} plays · recalculated each pitch`
              : 'Awaiting first pitch'
          }
        >
          <WinProbChart data={wpPoints} awayName={away.teamName} homeName={home.teamName} />
        </Panel>

        {/* Probable pitchers / starting pitchers */}
        <Panel
          className="lg:col-span-7"
          title={isPreview ? 'Probable starters' : 'Starting pitchers'}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PitcherCard player={awayProbable} side="Away" />
            <PitcherCard player={homeProbable} side="Home" />
          </div>
        </Panel>

        {/* Leverage swings */}
        <Panel
          className="lg:col-span-5"
          title="Highest-leverage plays"
          subtitle={topLeverage.length ? `Top 12 WP swings (home perspective)` : 'Pending live plays'}
        >
          <LeverageChart data={topLeverage} />
        </Panel>

        {/* Lineup vs. opposing starter (platoon splits) */}
        {(awayVsHome.length > 0 || homeVsAway.length > 0) && (
          <Panel
            className="lg:col-span-12"
            title="Lineup vs. opposing starter"
            subtitle="Each batter's season split vs. the starter's pitching hand · OBP/SLG/OPS"
            flush
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
              <MatchupTable
                rows={awayVsHome}
                teamLabel={`${away.teamName} vs ${homeStartHand}HP ${homeProbable?.fullName ?? ''}`}
              />
              <MatchupTable
                rows={homeVsAway}
                teamLabel={`${home.teamName} vs ${awayStartHand}HP ${awayProbable?.fullName ?? ''}`}
              />
            </div>
          </Panel>
        )}

        {/* Linescore */}
        {innings.length > 0 && (
          <Panel className="lg:col-span-12" title="Line score" flush>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                    <th className="text-left font-medium px-3 py-2">Team</th>
                    {innings.map((inn: any) => (
                      <th key={inn.num} className="text-center font-medium px-2 py-2 w-8 stat-num">
                        {inn.num}
                      </th>
                    ))}
                    <th className="text-center font-medium px-3 py-2 w-10">R</th>
                    <th className="text-center font-medium px-3 py-2 w-10">H</th>
                    <th className="text-center font-medium px-3 py-2 w-10">E</th>
                  </tr>
                </thead>
                <tbody>
                  <LinescoreRow
                    team={away.teamName}
                    teamId={away.id}
                    innings={innings.map((i: any) => i.away?.runs)}
                    r={linescore?.teams?.away?.runs}
                    h={linescore?.teams?.away?.hits}
                    e={linescore?.teams?.away?.errors}
                  />
                  <LinescoreRow
                    team={home.teamName}
                    teamId={home.id}
                    innings={innings.map((i: any) => i.home?.runs)}
                    r={linescore?.teams?.home?.runs}
                    h={linescore?.teams?.home?.hits}
                    e={linescore?.teams?.home?.errors}
                  />
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* Boxscore — batting */}
        {boxscore?.teams && !isPreview && (
          <>
            <Panel className="lg:col-span-12" title="Boxscore" flush>
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
                <BattingTable team={boxscore.teams.away} teamName={away.teamName} teamId={away.id} />
                <BattingTable team={boxscore.teams.home} teamName={home.teamName} teamId={home.id} />
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

function ord(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function TeamColumn({
  team,
  score,
  side,
  reverse,
}: {
  team: any;
  score?: number;
  side: 'away' | 'home';
  reverse?: boolean;
}) {
  return (
    <Link
      href={`/team/${team.id}`}
      className={`flex items-center gap-3 group ${reverse ? 'flex-row-reverse text-right' : ''}`}
    >
      <img src={teamCapLogoUrl(team.id)} alt="" className="w-10 h-10 invert opacity-90" />
      <div className="min-w-0">
        <div className="text-lg font-semibold tracking-tight group-hover:text-accent transition-colors truncate">
          {team.name}
        </div>
        <div className="text-2xs text-ink-muted stat-num">
          {team.record?.wins ?? 0}-{team.record?.losses ?? 0}
        </div>
      </div>
      <div className="ml-auto stat-num text-4xl font-semibold tabular-nums">
        {score !== undefined ? score : '—'}
      </div>
    </Link>
  );
}

function ProjBar({ label, pct, dim, accent }: { label: string; pct: number; dim?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between text-2xs mb-1">
        <span className="text-ink-muted truncate">{label}</span>
        <span className="stat-num font-medium">{(pct * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-bg-sunken rounded overflow-hidden">
        <div
          className={`h-full rounded ${accent ? 'bg-accent' : 'bg-ink-muted'}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

function PitcherCard({ player, side }: { player: any; side: string }) {
  if (!player?.id) {
    return (
      <div className="text-center py-6 text-2xs text-ink-faint">
        <div className="label-micro mb-1">{side} starter</div>
        TBD
      </div>
    );
  }
  return (
    <Link href={`/player/${player.id}`} className="flex items-center gap-4 group">
      <img
        src={playerHeadshotUrl(player.id, 120)}
        alt=""
        className="w-16 h-16 rounded-full bg-bg-raised object-cover"
      />
      <div>
        <div className="label-micro">{side} starter</div>
        <div className="text-base font-medium tracking-tight group-hover:text-accent">{player.fullName}</div>
        <div className="text-2xs text-ink-muted mt-0.5">
          {player.pitchHand?.code}HP {player.height} · {player.weight} lbs
        </div>
      </div>
    </Link>
  );
}

function LinescoreRow({
  team,
  teamId,
  innings,
  r,
  h,
  e,
}: {
  team: string;
  teamId: number;
  innings: (number | undefined)[];
  r?: number;
  h?: number;
  e?: number;
}) {
  return (
    <tr className="border-b border-line-subtle last:border-0 row-hover">
      <td className="px-3 py-1.5">
        <Link href={`/team/${teamId}`} className="hover:text-accent">{team}</Link>
      </td>
      {innings.map((v, i) => (
        <td key={i} className="text-center stat-num text-ink-muted">{v ?? '·'}</td>
      ))}
      <td className="text-center stat-num font-semibold px-3">{r ?? '—'}</td>
      <td className="text-center stat-num text-ink-muted px-3">{h ?? '—'}</td>
      <td className="text-center stat-num text-ink-muted px-3">{e ?? '—'}</td>
    </tr>
  );
}

function BattingTable({ team, teamName, teamId }: { team: any; teamName: string; teamId: number }) {
  const batters = (team.batters ?? []).map((id: number) => team.players[`ID${id}`]).filter(Boolean);
  if (!batters.length) {
    return (
      <div className="p-4">
        <div className="label-micro mb-2">{teamName}</div>
        <Empty title="No batting data yet" />
      </div>
    );
  }
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <Link href={`/team/${teamId}`} className="text-sm font-medium hover:text-accent">{teamName}</Link>
        <span className="text-2xs text-ink-faint stat-num">{batters.length} batters</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-micro text-ink-muted">
            <th className="text-left font-medium pb-1">Player</th>
            <Th>AB</Th><Th>R</Th><Th>H</Th><Th>RBI</Th><Th>BB</Th><Th>SO</Th><Th>AVG</Th>
          </tr>
        </thead>
        <tbody>
          {batters.map((b: any) => {
            const s = b.stats?.batting ?? {};
            const season = b.seasonStats?.batting ?? {};
            return (
              <tr key={b.person.id} className="row-hover border-t border-line-subtle">
                <td className="py-1 pr-2">
                  <Link href={`/player/${b.person.id}`} className="text-sm hover:text-accent">
                    {b.person.fullName}
                  </Link>
                  <span className="text-2xs text-ink-faint ml-1.5">{b.position?.abbreviation}</span>
                </td>
                <Td v={s.atBats} /><Td v={s.runs} /><Td v={s.hits} /><Td v={s.rbi} /><Td v={s.baseOnBalls} /><Td v={s.strikeOuts} />
                <td className="text-right stat-num text-ink-muted">{season.avg ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-right font-medium pb-1 pl-2">{children}</th>;
}
function Td({ v }: { v: any }) {
  return <td className="text-right stat-num text-ink-muted pl-2">{v ?? '—'}</td>;
}

function MatchupTable({
  rows,
  teamLabel,
}: {
  rows: Array<{ batterId: number; split: any; fullName: string }>;
  teamLabel: string;
}) {
  return (
    <div className="p-3">
      <div className="label-micro mb-2 px-1 truncate">{teamLabel}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-micro text-ink-muted">
            <th className="text-left font-medium pb-1">Batter</th>
            <th className="text-right font-medium pb-1">PA</th>
            <th className="text-right font-medium pb-1">AVG</th>
            <th className="text-right font-medium pb-1">OBP</th>
            <th className="text-right font-medium pb-1">SLG</th>
            <th className="text-right font-medium pb-1">OPS</th>
            <th className="text-right font-medium pb-1">HR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const s = r.split?.stat ?? {};
            const ops = parseFloat(s.ops ?? '0');
            return (
              <tr key={r.batterId} className="row-hover border-t border-line-subtle">
                <td className="py-1 pr-2 flex items-center gap-2">
                  <span className="text-2xs text-ink-faint stat-num w-4">{i + 1}</span>
                  <Link href={`/player/${r.batterId}`} className="text-sm hover:text-accent truncate">
                    {r.fullName || `#${r.batterId}`}
                  </Link>
                </td>
                <td className="text-right stat-num text-ink-muted">{s.plateAppearances ?? '—'}</td>
                <td className="text-right stat-num text-ink-muted">{s.avg ?? '—'}</td>
                <td className="text-right stat-num text-ink-muted">{s.obp ?? '—'}</td>
                <td className="text-right stat-num text-ink-muted">{s.slg ?? '—'}</td>
                <td className={`text-right stat-num ${ops > 0.800 ? 'text-signal-pos' : ops > 0 && ops < 0.650 ? 'text-signal-neg' : 'text-ink-muted'}`}>
                  {s.ops ?? '—'}
                </td>
                <td className="text-right stat-num text-ink-muted">{s.homeRuns ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-2xs text-ink-faint mt-2">
        Splits via MLB Stats API. Empty rows = no qualifying PA vs that hand yet this season.
      </p>
    </div>
  );
}
