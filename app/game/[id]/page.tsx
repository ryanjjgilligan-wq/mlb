import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getGameLive,
  getGameWinProbability,
  getStandings,
  getPlayerSplits,
  getPlayerSeasonStats,
  getLastGameForTeam,
  getHeadToHeadSchedule,
  getBatterVsPitcher,
  getTeamLastXGamesHitting,
  getTeamLastXGamesPitching,
  getPlayerLastXGames,
  teamCapLogoUrl,
  playerHeadshotUrl,
} from '@/lib/mlb';
import { blendStats, recencyWeightedFIP } from '@/lib/recency';
import { computeBullpenFatigue, type BullpenSummary } from '@/lib/bullpen';
import { H2HPanel } from '@/components/H2HPanel';
import { BvPMatrix } from '@/components/BvPMatrix';
import { Countdown } from '@/components/Countdown';
import { getPark, haversineMiles } from '@/lib/parks';
import {
  predictRunTotal,
  predictBatterProp,
  predictPitcherProp,
  predictFirst5,
  type RunTotalInput,
  type WeatherInput,
} from '@/lib/predict';
import { RunTotalPanel, PlayerPropsTable } from '@/components/PredictionPanel';
import { fip, parseInnings, kRate } from '@/lib/saber';
import { Panel } from '@/components/ui/Panel';
import { Stat } from '@/components/ui/Stat';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { WinProbChart, type WPPoint } from '@/components/WinProbChart';
import { LeverageChart, type LeveragePoint } from '@/components/LeverageChart';
import { AutoRefresh } from '@/components/AutoRefresh';
import { pythagorean, fmtAvg } from '@/lib/saber';
import { preGameHomeWP } from '@/lib/winprob';
import { LocalTime } from '@/components/LocalTime';

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

  const [awayVsHome, homeVsAway, awayBullpen, homeBullpen] = await Promise.all([
    pullMatchups(awayBatters, homeStartHand),
    pullMatchups(homeBatters, awayStartHand),
    computeBullpenFatigue(away.id).catch(() => null),
    computeBullpenFatigue(home.id).catch(() => null),
  ]);

  // Head-to-head (current + prior season) and per-batter vs starter career line
  const currentSeason = new Date(gameData.datetime?.dateTime ?? Date.now()).getUTCFullYear();
  const priorSeason = currentSeason - 1;
  const [h2hCurrent, h2hPrior, awayBvpHomeStarter, homeBvpAwayStarter] = await Promise.all([
    getHeadToHeadSchedule(home.id, away.id, currentSeason).catch(() => []),
    getHeadToHeadSchedule(home.id, away.id, priorSeason).catch(() => []),
    homeProbable?.id
      ? Promise.all(awayBatters.map(async (bid) => ({
          batterId: bid,
          batterName: boxscoreEarly?.teams?.away?.players?.[`ID${bid}`]?.person?.fullName ?? '',
          vs: await getBatterVsPitcher(bid, homeProbable.id).catch(() => null),
        })))
      : Promise.resolve([]),
    awayProbable?.id
      ? Promise.all(homeBatters.map(async (bid) => ({
          batterId: bid,
          batterName: boxscoreEarly?.teams?.home?.players?.[`ID${bid}`]?.person?.fullName ?? '',
          vs: await getBatterVsPitcher(bid, awayProbable.id).catch(() => null),
        })))
      : Promise.resolve([]),
  ]);

  // ── Predictions inputs ───────────────────────────────────────────────────
  const gameDateOnly = (gameData.datetime?.officialDate ?? gameData.datetime?.dateTime?.slice(0, 10) ?? '');
  const venueId = gameData.venue?.id;
  const park = getPark(venueId);

  // Weather payload off the live feed
  const wxRaw = gameData.weather ?? {};
  const weather: WeatherInput = {
    tempF: wxRaw.temp ? parseInt(wxRaw.temp, 10) : undefined,
    windSpeedMph: wxRaw.wind ? parseInt(wxRaw.wind, 10) : undefined,
    windDir: wxRaw.wind ?? undefined, // "10 mph, Out To CF"
    condition: wxRaw.condition,
  };

  // Travel for visitor and rest for both clubs
  const [awayLast, homeLast] = await Promise.all([
    gameDateOnly ? getLastGameForTeam(away.id, gameDateOnly).catch(() => null) : Promise.resolve(null),
    gameDateOnly ? getLastGameForTeam(home.id, gameDateOnly).catch(() => null) : Promise.resolve(null),
  ]);
  const awayPrevPark = awayLast?.venue?.id ? getPark(awayLast.venue.id) : park;
  const awayTravelMiles = haversineMiles(awayPrevPark, park);
  const daysBetween = (a?: string, b?: string) => {
    if (!a || !b) return undefined;
    return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
  };
  const awayDaysRest = daysBetween(awayLast?.gameDate, gameData.datetime?.dateTime);
  const homeDaysRest = daysBetween(homeLast?.gameDate, gameData.datetime?.dateTime);

  // Team RS/G and RA/G from standings
  const awayRec = standings.flatMap((d) => d.teamRecords).find((tr) => tr.team.id === away.id);
  const homeRec = standings.flatMap((d) => d.teamRecords).find((tr) => tr.team.id === home.id);
  const teamRate = (rec: typeof awayRec, key: 'runsScored' | 'runsAllowed') => {
    if (!rec) return 4.5;
    const games = rec.wins + rec.losses;
    return games > 0 ? (rec[key] ?? 0) / games : 4.5;
  };

  // Starter inputs: season + last-4-starts + last-8-starts → blend
  const [awayStarterStats, homeStarterStats, awayStarterLast4, awayStarterLast8, homeStarterLast4, homeStarterLast8] = await Promise.all([
    awayProbable?.id ? getPlayerSeasonStats(awayProbable.id, 'pitching').catch(() => null) : Promise.resolve(null),
    homeProbable?.id ? getPlayerSeasonStats(homeProbable.id, 'pitching').catch(() => null) : Promise.resolve(null),
    awayProbable?.id ? getPlayerLastXGames(awayProbable.id, 'pitching', 4).catch(() => null) : Promise.resolve(null),
    awayProbable?.id ? getPlayerLastXGames(awayProbable.id, 'pitching', 8).catch(() => null) : Promise.resolve(null),
    homeProbable?.id ? getPlayerLastXGames(homeProbable.id, 'pitching', 4).catch(() => null) : Promise.resolve(null),
    homeProbable?.id ? getPlayerLastXGames(homeProbable.id, 'pitching', 8).catch(() => null) : Promise.resolve(null),
  ]);

  // Team recency-weighted offense + defense
  const [awayTeamLast15Hit, awayTeamLast30Hit, awayTeamLast15Pit, awayTeamLast30Pit,
         homeTeamLast15Hit, homeTeamLast30Hit, homeTeamLast15Pit, homeTeamLast30Pit] = await Promise.all([
    getTeamLastXGamesHitting(away.id, 15).catch(() => null),
    getTeamLastXGamesHitting(away.id, 30).catch(() => null),
    getTeamLastXGamesPitching(away.id, 15).catch(() => null),
    getTeamLastXGamesPitching(away.id, 30).catch(() => null),
    getTeamLastXGamesHitting(home.id, 15).catch(() => null),
    getTeamLastXGamesHitting(home.id, 30).catch(() => null),
    getTeamLastXGamesPitching(home.id, 15).catch(() => null),
    getTeamLastXGamesPitching(home.id, 30).catch(() => null),
  ]);

  // Use recency-weighted FIP when last-N starts are available
  const starterInput = (season: any, last4: any, last8: any) => {
    if (!season?.stat && !last4 && !last8) return undefined;
    const seasonStat = season?.stat;
    if (last4 || last8) {
      const blended = recencyWeightedFIP(last4, last8, seasonStat);
      if (blended.fip != null) {
        return { fip: blended.fip, ipPerStart: blended.ipPerStart ?? 5.5 };
      }
    }
    if (!seasonStat) return undefined;
    const computedFip = fip(seasonStat);
    const ip = parseInnings(seasonStat.inningsPitched);
    const gs = Number(seasonStat.gamesStarted) || Number(seasonStat.gamesPlayed) || 1;
    return {
      fip: Number.isFinite(computedFip) && computedFip > 0 ? computedFip : undefined,
      ipPerStart: gs > 0 ? Math.min(7, Math.max(3, ip / gs)) : 5.5,
    };
  };

  // Umpire — pulled from boxscore officials. Until we have a per-ump
  // historical aggregator, kzBoost defaults to 1.0 (neutral) and gets
  // surfaced informationally.
  const officials: any[] = boxscore?.officials ?? [];
  const homePlateUmp = officials.find((o: any) => /home plate/i.test(o.officialType ?? ''))?.official;
  const umpire = homePlateUmp
    ? { name: homePlateUmp.fullName as string, kzBoost: 1, runsModifier: 1 }
    : undefined;

  // Recency-blended team rates (last-15 + last-30 + season)
  // Build a synthetic season "stat" object so blendStats can mix windows.
  const seasonOffStat = (rec: any) =>
    rec ? { runs: rec.runsScored ?? 0, gamesPlayed: rec.wins + rec.losses } : null;
  const seasonDefStat = (rec: any) =>
    rec ? { runs: rec.runsAllowed ?? 0, gamesPlayed: rec.wins + rec.losses } : null;

  const blendRPG = (last15: any, last30: any, season: any): number | null => {
    const blended = blendStats(last15, last30, season);
    const g = Number(blended.gamesPlayed) || 0;
    const r = Number(blended.runs) || 0;
    return g > 0 ? r / g : null;
  };

  const homeRSWeighted = blendRPG(homeTeamLast15Hit, homeTeamLast30Hit, seasonOffStat(homeRec)) ?? teamRate(homeRec, 'runsScored');
  const awayRSWeighted = blendRPG(awayTeamLast15Hit, awayTeamLast30Hit, seasonOffStat(awayRec)) ?? teamRate(awayRec, 'runsScored');
  const homeRAWeighted = blendRPG(homeTeamLast15Pit, homeTeamLast30Pit, seasonDefStat(homeRec)) ?? teamRate(homeRec, 'runsAllowed');
  const awayRAWeighted = blendRPG(awayTeamLast15Pit, awayTeamLast30Pit, seasonDefStat(awayRec)) ?? teamRate(awayRec, 'runsAllowed');

  const recencyApplied =
    !!(homeTeamLast15Hit || awayTeamLast15Hit || awayStarterLast4 || homeStarterLast4);

  const runTotalInput: RunTotalInput = {
    home: {
      teamId: home.id,
      runsScoredPerGame: homeRSWeighted,
      runsAllowedPerGame: homeRAWeighted,
    },
    away: {
      teamId: away.id,
      runsScoredPerGame: awayRSWeighted,
      runsAllowedPerGame: awayRAWeighted,
    },
    homeStarter: starterInput(homeStarterStats, homeStarterLast4, homeStarterLast8),
    awayStarter: starterInput(awayStarterStats, awayStarterLast4, awayStarterLast8),
    park,
    weather,
    travel: { awayTravelMiles, awayDaysRest, homeDaysRest },
    umpire,
  };
  const runTotal = predictRunTotal(runTotalInput);
  const first5 = predictFirst5(runTotalInput);
  const weatherMult = runTotal.modifiers.find((m) => m.name === 'Weather')?.multiplier ?? 1;
  const umpKZ = umpire?.kzBoost ?? 1;

  // Per-batter expanded props (hits, TB, HR, walks, Ks, doubles)
  const batterPropFor = (split: any, oppStarterStats: any) => {
    const s = split?.stat;
    if (!s) return null;
    const avg = parseFloat(s.avg ?? '0');
    const obp = parseFloat(s.obp ?? '0');
    const slg = parseFloat(s.slg ?? '0');
    const ab = Number(s.atBats);
    const pa = Number(s.plateAppearances) || ab;
    const hr = Number(s.homeRuns);
    const doubles = Number(s.doubles);
    const bb = Number(s.baseOnBalls);
    const k = Number(s.strikeOuts);
    const oppPa = Number(oppStarterStats?.stat?.battersFaced ?? 0);
    const oppKRate = oppPa > 0 ? Number(oppStarterStats?.stat?.strikeOuts ?? 0) / oppPa : undefined;
    const oppBBRate = oppPa > 0 ? Number(oppStarterStats?.stat?.baseOnBalls ?? 0) / oppPa : undefined;
    const oppHrRate = ab > 0 ? Number(oppStarterStats?.stat?.homeRuns ?? 0) / Math.max(1, Number(oppStarterStats?.stat?.battersFaced ?? ab)) : undefined;
    return predictBatterProp({
      pa: 4.2,
      avg, obp, slg,
      homeRunRate: ab > 0 ? hr / ab : undefined,
      doublesPerAb: ab > 0 ? doubles / ab : undefined,
      walkRate: pa > 0 ? bb / pa : undefined,
      kRate: pa > 0 ? k / pa : undefined,
      oppPitcherKRate: oppKRate,
      oppPitcherBBrate: oppBBRate,
      oppPitcherHRrate: oppHrRate,
      parkHrFactor: park.hr,
      parkHFactor: park.h,
      parkSoFactor: park.so,
      umpKZBoost: umpKZ,
      weatherMult,
    });
  };

  const awayBatterRows = awayVsHome
    .map((r) => ({ r, prop: batterPropFor(r.split, homeStarterStats) }))
    .filter((x) => x.prop)
    .map(({ r, prop }) => ({
      name: r.fullName || `#${r.batterId}`,
      playerId: r.batterId,
      expected: prop!.expectedHits,
      label: 'hits',
      columns: [
        { key: 'h', label: 'xH', value: prop!.expectedHits.toFixed(2) },
        { key: 'tb', label: 'xTB', value: prop!.expectedTotalBases.toFixed(2) },
        { key: 'p1', label: '≥1 H', value: `${(prop!.pHit1Plus * 100).toFixed(0)}%` },
        { key: 'p2', label: '≥2 H', value: `${(prop!.pHit2Plus * 100).toFixed(0)}%` },
        { key: 'hr', label: 'HR%', value: `${(prop!.pHrAtLeastOne * 100).toFixed(1)}%` },
      ],
    }));

  const homeBatterRows = homeVsAway
    .map((r) => ({ r, prop: batterPropFor(r.split, awayStarterStats) }))
    .filter((x) => x.prop)
    .map(({ r, prop }) => ({
      name: r.fullName || `#${r.batterId}`,
      playerId: r.batterId,
      expected: prop!.expectedHits,
      label: 'hits',
      columns: [
        { key: 'h', label: 'xH', value: prop!.expectedHits.toFixed(2) },
        { key: 'tb', label: 'xTB', value: prop!.expectedTotalBases.toFixed(2) },
        { key: 'p1', label: '≥1 H', value: `${(prop!.pHit1Plus * 100).toFixed(0)}%` },
        { key: 'p2', label: '≥2 H', value: `${(prop!.pHit2Plus * 100).toFixed(0)}%` },
        { key: 'hr', label: 'HR%', value: `${(prop!.pHrAtLeastOne * 100).toFixed(1)}%` },
      ],
    }));

  // Pitcher K props for each starter
  const pitcherPropFor = (starter: any, oppLineupSplits: Array<{ split: any }>) => {
    if (!starter?.stat) return null;
    const ip = parseInnings(starter.stat.inningsPitched);
    const gs = Number(starter.stat.gamesStarted) || 1;
    const bf = Number(starter.stat.battersFaced) || 1;
    const k = Number(starter.stat.strikeOuts) || 0;
    const k9 = ip > 0 ? (k * 9) / ip : 8;
    const ipPerStart = ip / Math.max(1, gs);
    // Opp team K%: rough average of available splits
    const totalK = oppLineupSplits.reduce((s, r) => s + (Number(r.split?.stat?.strikeOuts) || 0), 0);
    const totalPa = oppLineupSplits.reduce((s, r) => s + (Number(r.split?.stat?.plateAppearances) || 0), 0);
    const oppKRate = totalPa > 0 ? totalK / totalPa : 0.22;
    return predictPitcherProp({
      oppKRate,
      pitcherK9: k9,
      pitcherIpPerStart: ipPerStart,
      parkSoFactor: park.so,
    });
  };

  const awayStarterProp = awayStarterStats ? pitcherPropFor(awayStarterStats, homeVsAway) : null;
  const homeStarterProp = homeStarterStats ? pitcherPropFor(homeStarterStats, awayVsHome) : null;

  const weatherSummary = weather.tempF
    ? `${weather.tempF}°F${weather.windDir ? ` · ${weather.windDir}` : ''}${weather.condition ? ` · ${weather.condition}` : ''}`
    : undefined;
  const travelSummary = awayTravelMiles > 0
    ? `Away traveled ${Math.round(awayTravelMiles)} mi${awayDaysRest !== undefined ? ` · ${awayDaysRest}d rest` : ''}`
    : undefined;

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
            <LocalTime iso={gameData.datetime?.dateTime} format="time" className="text-2xs text-ink-muted stat-num" />
            <span className="text-2xs text-ink-faint">·</span>
            <span className="text-2xs text-ink-muted">{gameData.venue?.name}</span>
            {isLive && (
              <>
                <span className="text-2xs text-ink-faint">·</span>
                <AutoRefresh intervalMs={15_000} label="auto-refresh 15s" />
              </>
            )}
            {isPreview && (
              <>
                <span className="text-2xs text-ink-faint">·</span>
                <AutoRefresh intervalMs={300_000} label="auto-refresh 5m" />
              </>
            )}
          </div>
          <span className="text-2xs text-ink-faint flex items-center gap-2">
            {isPreview && (
              <Countdown iso={gameData.datetime?.dateTime} status="Preview" prefix="first pitch in " />
            )}
            <span>Game {gamePk}</span>
          </span>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamColumn team={away} score={linescore?.teams?.away?.runs} side="away" />
          <div className="text-center min-w-[120px]">
            {isPreview ? (
              <>
                <div className="label-micro">First pitch</div>
                <LocalTime iso={gameData.datetime?.dateTime} format="time" className="stat-num text-2xl font-semibold mt-1 block" fallback="—" />
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

        {/* Run total predictor — full transparency on inputs */}
        <Panel
          className="lg:col-span-12"
          title={
            <span className="flex items-center gap-2">
              Run total prediction
              {recencyApplied && (
                <span className="text-2xs px-1.5 py-0.5 rounded border border-signal-pos/30 bg-signal-pos/5 text-signal-pos uppercase tracking-micro">
                  recency-weighted
                </span>
              )}
            </span>
          }
          subtitle={
            recencyApplied
              ? 'Last-15/30 game team rates + last-4-start starter FIP blended with season · park × weather × travel/rest × ump'
              : 'Season team RS/RA + starter FIP × park × weather × travel/rest × ump'
          }
        >
          <RunTotalPanel
            output={runTotal}
            homeName={home.teamName}
            awayName={away.teamName}
            parkName={park.name}
            weatherSummary={weatherSummary}
            travelSummary={travelSummary}
          />
        </Panel>

        {/* First 5 innings prediction */}
        <Panel
          className="lg:col-span-12"
          title="First 5 innings (F5)"
          subtitle="Starter-anchored sub-game model · innings 1–5 only"
        >
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
            <div className="space-y-3 self-start">
              <div>
                <div className="label-micro">F5 expected total</div>
                <div className="stat-num text-3xl font-semibold">{first5.expectedTotal.toFixed(2)}</div>
                <div className="text-2xs text-ink-faint">
                  80% CI <span className="stat-num">{first5.ci80.low.toFixed(1)}–{first5.ci80.high.toFixed(1)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-line-subtle">
                <div>
                  <div className="label-micro">{away.teamName}</div>
                  <div className="stat-num text-xl font-semibold">{first5.expectedAwayRuns.toFixed(2)}</div>
                </div>
                <div>
                  <div className="label-micro">{home.teamName}</div>
                  <div className="stat-num text-xl font-semibold">{first5.expectedHomeRuns.toFixed(2)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-line-subtle">
                <div>
                  <div className="label-micro">F5 home WP</div>
                  <div className="stat-num text-xl font-semibold">{(first5.pHomeWin * 100).toFixed(1)}%</div>
                </div>
                <div title="No Runs in First Inning">
                  <div className="label-micro">P(NRFI)</div>
                  <div className="stat-num text-xl font-semibold">{(first5.pNRFI * 100).toFixed(1)}%</div>
                </div>
              </div>
              <div className="pt-3 border-t border-line-subtle">
                <div className="label-micro mb-1">Confidence</div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-bg-sunken rounded overflow-hidden">
                    <div
                      className={`h-full ${first5.confidence.level === 'high' ? 'bg-signal-pos' : first5.confidence.level === 'medium' ? 'bg-signal-info' : 'bg-ink-muted'}`}
                      style={{ width: `${first5.confidence.score}%` }}
                    />
                  </div>
                  <span className="text-2xs stat-num text-ink-muted">{first5.confidence.score}/100</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="label-micro mb-2">P(F5 total over X.5)</div>
                <div className="grid grid-cols-5 gap-2">
                  {first5.pTotalOver.map((p) => (
                    <div key={p.line} className="bg-bg-raised border border-line rounded text-center py-2">
                      <div className="text-2xs text-ink-faint stat-num">o{p.line}</div>
                      <div className="stat-num font-medium text-ink text-sm">{(p.prob * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="label-micro mb-2">Starter F5 projections</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                      <th className="text-left font-medium pb-1.5">Pitcher</th>
                      <th className="text-right font-medium pb-1.5">IP</th>
                      <th className="text-right font-medium pb-1.5">xK</th>
                      <th className="text-right font-medium pb-1.5">xBB</th>
                      <th className="text-right font-medium pb-1.5">xH</th>
                      <th className="text-right font-medium pb-1.5">xHR</th>
                      <th className="text-right font-medium pb-1.5">xER</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { side: 'Away', name: awayProbable?.fullName, id: awayProbable?.id, line: first5.starters.away },
                      { side: 'Home', name: homeProbable?.fullName, id: homeProbable?.id, line: first5.starters.home },
                    ].map((row, i) => (
                      <tr key={i} className="row-hover border-b border-line-subtle last:border-0">
                        <td className="py-1.5">
                          {row.id && row.name ? (
                            <Link href={`/player/${row.id}`} className="hover:text-accent text-sm">{row.name}</Link>
                          ) : (
                            <span className="text-ink-muted text-sm">{row.name ?? `${row.side} TBD`}</span>
                          )}
                        </td>
                        <td className="text-right stat-num text-ink-muted">{row.line ? row.line.inningsCovered.toFixed(1) : '—'}</td>
                        <td className="text-right stat-num text-ink">{row.line ? row.line.expectedK.toFixed(1) : '—'}</td>
                        <td className="text-right stat-num text-ink-muted">{row.line ? row.line.expectedBB.toFixed(1) : '—'}</td>
                        <td className="text-right stat-num text-ink-muted">{row.line ? row.line.expectedHits.toFixed(1) : '—'}</td>
                        <td className="text-right stat-num text-ink-muted">{row.line ? row.line.expectedHRs.toFixed(2) : '—'}</td>
                        <td className="text-right stat-num text-ink">{row.line ? row.line.expectedRuns.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-2xs text-ink-faint mt-2">
                  Per-starter rates synthesized from FIP + IP/start. Park & ump factors applied.
                  Method on <Link href="/lab" className="underline">/lab</Link>.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        {/* Bullpen fatigue comparison — late-innings edge */}
        {(awayBullpen || homeBullpen) && (
          <Panel
            className="lg:col-span-12"
            title="Bullpen state · 3-day workload"
            subtitle="Real edge for over/under and late-game props · the gassed pen leaks runs in the 6th–9th"
            flush
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
              {[
                { name: away.teamName, sum: awayBullpen },
                { name: home.teamName, sum: homeBullpen },
              ].map(({ name, sum }) => (
                <div key={name} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">{name}</span>
                    {sum && (
                      <span className={`stat-num text-sm font-semibold ${
                        sum.fatigueScore >= 75 ? 'text-signal-pos' :
                        sum.fatigueScore <= 45 ? 'text-signal-neg' : 'text-ink'
                      }`}>{sum.fatigueScore}/100</span>
                    )}
                  </div>
                  {!sum ? (
                    <p className="text-2xs text-ink-faint">No recent bullpen data</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-3 text-2xs">
                        <div>
                          <div className="label-micro">Pitches 3d</div>
                          <div className="stat-num text-base">{sum.totalPitches3d}</div>
                        </div>
                        <div>
                          <div className="label-micro">Gassed arms</div>
                          <div className={`stat-num text-base ${sum.gassedCount > 0 ? 'text-signal-neg' : 'text-ink-muted'}`}>{sum.gassedCount}</div>
                        </div>
                        <div>
                          <div className="label-micro">Fresh arms</div>
                          <div className={`stat-num text-base ${sum.freshCount > 2 ? 'text-signal-pos' : 'text-ink-muted'}`}>{sum.freshCount}</div>
                        </div>
                      </div>
                      {sum.pitchers.slice(0, 5).length > 0 && (
                        <ul className="text-2xs space-y-1">
                          {sum.pitchers.slice(0, 5).map((p) => (
                            <li key={p.id} className="flex items-center gap-2">
                              <span className={`px-1 rounded text-[9px] uppercase tracking-micro ${
                                p.status === 'fresh' ? 'bg-signal-pos/10 text-signal-pos' :
                                p.status === 'tired' ? 'bg-signal-warn/10 text-signal-warn' :
                                'bg-signal-neg/10 text-signal-neg'
                              }`}>{p.status}</span>
                              <Link href={`/player/${p.id}`} className="hover:text-accent flex-1 truncate">{p.name}</Link>
                              <span className="stat-num text-ink-muted">{p.totalPitches3d}P</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Player props — pitchers */}
        {(awayStarterProp || homeStarterProp) && (
          <Panel
            className="lg:col-span-12"
            title="Starter K props"
            subtitle="Per-start strikeouts with ≥6 / ≥8 K probabilities · Poisson tail"
            flush
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                  <th className="text-left font-medium px-3 py-2">Pitcher</th>
                  <th className="text-right font-medium px-2 py-2">xK</th>
                  <th className="text-right font-medium px-2 py-2">≥6 K</th>
                  <th className="text-right font-medium px-2 py-2">≥8 K</th>
                </tr>
              </thead>
              <tbody>
                {awayProbable && awayStarterProp && (
                  <tr className="row-hover border-b border-line-subtle">
                    <td className="px-3 py-1.5">
                      <Link href={`/player/${awayProbable.id}`} className="hover:text-accent">{awayProbable.fullName}</Link>
                      <span className="text-2xs text-ink-faint ml-2">{away.teamName}</span>
                    </td>
                    <td className="text-right stat-num px-2 py-1.5 text-ink">{awayStarterProp.expectedStrikeouts.toFixed(2)}</td>
                    <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{(awayStarterProp.pSixPlus * 100).toFixed(0)}%</td>
                    <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{(awayStarterProp.pEightPlus * 100).toFixed(0)}%</td>
                  </tr>
                )}
                {homeProbable && homeStarterProp && (
                  <tr className="row-hover">
                    <td className="px-3 py-1.5">
                      <Link href={`/player/${homeProbable.id}`} className="hover:text-accent">{homeProbable.fullName}</Link>
                      <span className="text-2xs text-ink-faint ml-2">{home.teamName}</span>
                    </td>
                    <td className="text-right stat-num px-2 py-1.5 text-ink">{homeStarterProp.expectedStrikeouts.toFixed(2)}</td>
                    <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{(homeStarterProp.pSixPlus * 100).toFixed(0)}%</td>
                    <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{(homeStarterProp.pEightPlus * 100).toFixed(0)}%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        )}

        {/* Player props — batters */}
        {(awayBatterRows.length > 0 || homeBatterRows.length > 0) && (
          <Panel
            className="lg:col-span-12"
            title="Batter props"
            subtitle="Expected hits + total bases vs opposing starter · binomial event probabilities"
            flush
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
              <div className="p-3">
                <div className="label-micro mb-2 px-1 truncate">{away.teamName} · vs {homeProbable?.fullName ?? 'TBD'}</div>
                <PlayerPropsTable rows={awayBatterRows} />
              </div>
              <div className="p-3">
                <div className="label-micro mb-2 px-1 truncate">{home.teamName} · vs {awayProbable?.fullName ?? 'TBD'}</div>
                <PlayerPropsTable rows={homeBatterRows} />
              </div>
            </div>
          </Panel>
        )}

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

        {/* Head-to-head series */}
        <Panel
          className="lg:col-span-12"
          title="Head-to-head"
          subtitle={`${currentSeason} season series · prior season for context`}
          flush
        >
          <H2HPanel
            games={h2hCurrent}
            homeId={home.id}
            awayId={away.id}
            homeName={home.teamName}
            awayName={away.teamName}
            season={currentSeason}
            priorSeason={h2hPrior.length > 0 ? { games: h2hPrior, season: priorSeason } : undefined}
          />
        </Panel>

        {/* Batter-vs-Pitcher career history */}
        {(awayBvpHomeStarter.length > 0 || homeBvpAwayStarter.length > 0) && (
          <Panel
            className="lg:col-span-12"
            title="Batter vs. starter — career"
            subtitle="Career line for each batter against today's opposing starter · vsPlayer endpoint"
            flush
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
              {awayBvpHomeStarter.length > 0 && (
                <BvPMatrix
                  rows={awayBvpHomeStarter}
                  pitcherName={homeProbable?.fullName ?? 'Starter'}
                  teamName={away.teamName}
                />
              )}
              {homeBvpAwayStarter.length > 0 && (
                <BvPMatrix
                  rows={homeBvpAwayStarter}
                  pitcherName={awayProbable?.fullName ?? 'Starter'}
                  teamName={home.teamName}
                />
              )}
            </div>
          </Panel>
        )}

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
      <img src={teamCapLogoUrl(team.id)} alt="" className="w-10 h-10 team-logo opacity-90" />
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
