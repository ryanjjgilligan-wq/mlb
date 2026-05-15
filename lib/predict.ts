/**
 * Run-total + player-prop prediction engine.
 *
 * Design principles
 * -----------------
 *   1. Transparent baseline. Every multiplier is named, sourced, and bounded.
 *      We do not pretend this is a trained XGBoost. It is a transparent
 *      additive/multiplicative model that incorporates the user's requested
 *      factors (travel, weather, park, rest) plus the obvious baseline
 *      (team offense/defense, starter quality).
 *
 *   2. Uncertainty is shown, not hidden. Run total → mean λ. The Poisson
 *      assumption gives a distribution; we report 80% CI directly.
 *
 *   3. Player props are conditional point estimates with explicit denoms
 *      (PA, AB). Sample size warnings shown when n is small.
 *
 *   4. Park, weather, travel, rest each contribute a NAMED multiplier so a
 *      reader can see exactly why the projection moved.
 *
 * Limits documented on /lab.
 */

import { fip, parseInnings } from './saber';
import { getPark, haversineMiles, type ParkProfile } from './parks';

// ── Run total ───────────────────────────────────────────────────────────────

export type TeamOffenseDefense = {
  teamId: number;
  // Season aggregates
  runsScoredPerGame: number;
  runsAllowedPerGame: number;
  // Optional split context for opponent handedness; falls back to season
  hittingSeasonAvg?: number;
};

export type WeatherInput = {
  tempF?: number;
  windSpeedMph?: number;
  windDir?: string; // "Out To CF", "In From LF", etc.
  condition?: string; // "Clear", "Cloudy", "Drizzle", "Snow", etc.
};

export type StarterInput = {
  fip?: number | null;
  ipPerStart?: number; // bulk
};

export type TravelRestInput = {
  awayTravelMiles?: number; // distance from team's previous game venue
  homeDaysRest?: number;
  awayDaysRest?: number;
};

export type UmpireInput = {
  name?: string;
  /**
   * Strike-zone size factor relative to the league average. >1.0 = larger zone
   * (more strikes called → more Ks, fewer BBs, slightly fewer runs). <1.0 =
   * smaller zone (fewer Ks, more BBs, slightly more runs). Defaults to 1.0
   * when no historical data is available.
   */
  kzBoost?: number;
  runsModifier?: number; // multiplicative on run total; 1.0 neutral
};

export type RunTotalInput = {
  home: TeamOffenseDefense;
  away: TeamOffenseDefense;
  homeStarter?: StarterInput;
  awayStarter?: StarterInput;
  park: ParkProfile;
  weather?: WeatherInput;
  travel?: TravelRestInput;
  umpire?: UmpireInput;
};

export type Component = { name: string; multiplier: number; note: string };

export type Confidence = {
  level: 'low' | 'medium' | 'high';
  score: number; // 0-100
  reasons: string[];
};

export type RunTotalOutput = {
  expectedHomeRuns: number;
  expectedAwayRuns: number;
  expectedTotal: number;
  components: { side: 'home' | 'away'; label: string; runs: number }[];
  modifiers: Component[];
  ci80: { low: number; high: number };
  ci95: { low: number; high: number };
  pHomeWin: number;
  confidence: Confidence;
  // Bounds — when we have low confidence in any input
  warnings: string[];
};

const LEAGUE_AVG_RPG = 4.5; // recent MLB era — used as the anchor when factors compose

/**
 * Estimate a team's expected runs *in this game* against this opposing
 * pitching/defense, using a simple multiplicative log5-style adjustment.
 *
 * runs_vs_opp = leagueAvg * (team_off / leagueAvg) * (opp_def / leagueAvg)
 *
 * Then apply park, weather, travel, rest multipliers.
 *
 * Starter FIP adjustment: opp_def shifts toward the starter's FIP for the
 * expected innings they pitch — IP_starter/9. We blend opp_def with
 *   FIP_to_runs(FIP) for that share.
 */
export function predictRunTotal(input: RunTotalInput): RunTotalOutput {
  const modifiers: Component[] = [];
  const warnings: string[] = [];

  const homeOff = input.home.runsScoredPerGame || LEAGUE_AVG_RPG;
  const homeDef = input.home.runsAllowedPerGame || LEAGUE_AVG_RPG;
  const awayOff = input.away.runsScoredPerGame || LEAGUE_AVG_RPG;
  const awayDef = input.away.runsAllowedPerGame || LEAGUE_AVG_RPG;
  if (!input.home.runsScoredPerGame) warnings.push('Home offense run rate missing — using league average.');
  if (!input.away.runsScoredPerGame) warnings.push('Away offense run rate missing — using league average.');

  // Starter influence: blend opp_def toward starter's FIP for their expected innings.
  function blendStarter(oppDef: number, starter?: StarterInput): number {
    if (!starter || starter.fip == null || !Number.isFinite(starter.fip)) return oppDef;
    const ip = Math.min(7, Math.max(3, starter.ipPerStart ?? 5.5));
    const share = ip / 9;
    // Starter "expected runs allowed per game" proxy: FIP itself is an ERA-scale number,
    // so we treat it as their own RA/9 contribution.
    return oppDef * (1 - share) + (starter.fip ?? oppDef) * share;
  }

  const homeDefBlend = blendStarter(homeDef, input.homeStarter);
  const awayDefBlend = blendStarter(awayDef, input.awayStarter);

  // Log5-style on offense × opp pitching, scaled to league average runs.
  const homeExpRaw =
    LEAGUE_AVG_RPG * (homeOff / LEAGUE_AVG_RPG) * (awayDefBlend / LEAGUE_AVG_RPG);
  const awayExpRaw =
    LEAGUE_AVG_RPG * (awayOff / LEAGUE_AVG_RPG) * (homeDefBlend / LEAGUE_AVG_RPG);

  // ── Multipliers ──
  // Park factor — most impactful single lever.
  const parkMult = (input.park.runs ?? 100) / 100;
  modifiers.push({
    name: 'Park',
    multiplier: parkMult,
    note: `${input.park.name} · runs factor ${input.park.runs}`,
  });

  // Elevation kicker — Coors, Chase, Atlanta. We already capture this in
  // the static park factor, so the elevation kicker is small and only
  // applies to home runs implicitly. Skip explicit kicker; it's double
  // counting otherwise. Documented on /lab.

  // Weather multiplier
  const wx = weatherMultiplier(input.weather, input.park);
  modifiers.push(wx);

  // Travel / rest
  const tr = travelRestMultiplier(input.travel);
  modifiers.push(...tr);

  // Umpire — apply runsModifier if provided. KZ boost only flows to player props.
  if (input.umpire) {
    const ump = input.umpire;
    const mult = ump.runsModifier ?? 1;
    modifiers.push({
      name: 'Umpire',
      multiplier: mult,
      note: ump.name
        ? `${ump.name}${ump.kzBoost && ump.kzBoost !== 1 ? ` · KZ ${ump.kzBoost > 1 ? '+' : ''}${((ump.kzBoost - 1) * 100).toFixed(0)}%` : ' · neutral'}`
        : 'No ump data — assumed neutral',
    });
  }

  // Compose multiplier (multiplicative)
  const totalMult = modifiers.reduce((m, c) => m * c.multiplier, 1);

  const expectedHomeRuns = homeExpRaw * totalMult;
  const expectedAwayRuns = awayExpRaw * totalMult;
  const expectedTotal = expectedHomeRuns + expectedAwayRuns;

  // Confidence intervals — assume each team's runs ~ Poisson(λ) with overdispersion
  // factor ψ ≈ 1.5 (well-documented MLB overdispersion). Use a normal approx
  // for the total with var = ψ · λ.
  const overdispersion = 1.5;
  const variance = overdispersion * expectedTotal;
  const sd = Math.sqrt(variance);
  const ci80 = { low: Math.max(0, expectedTotal - 1.282 * sd), high: expectedTotal + 1.282 * sd };
  const ci95 = { low: Math.max(0, expectedTotal - 1.96 * sd), high: expectedTotal + 1.96 * sd };

  // Win prob — normal approximation on (home − away)
  const diffMean = expectedHomeRuns - expectedAwayRuns;
  const diffSD = Math.sqrt(overdispersion * (expectedHomeRuns + expectedAwayRuns));
  const z = diffSD > 0 ? diffMean / diffSD : 0;
  const pHomeWin = normalCdf(z);

  // Confidence — derived from input availability + signal strength.
  //
  // Calibrated so a normal preview game with all data lands in the 85–95
  // range, low-data states drop into 50–70, and only signal-poor games or
  // multi-warning games fall under 50.
  const reasons: string[] = [];
  let score = 45;
  if (input.homeStarter?.fip) { score += 12; reasons.push('home starter FIP known'); }
  if (input.awayStarter?.fip) { score += 12; reasons.push('away starter FIP known'); }
  if (input.homeStarter?.ipPerStart && input.homeStarter.ipPerStart > 4) { score += 3; reasons.push('home starter is bulk'); }
  if (input.awayStarter?.ipPerStart && input.awayStarter.ipPerStart > 4) { score += 3; reasons.push('away starter is bulk'); }
  if (input.weather && (input.weather.tempF || input.weather.windSpeedMph)) { score += 8; reasons.push('weather data present'); }
  if (input.travel) { score += 4; reasons.push('travel/rest applied'); }
  if (input.umpire?.name) { score += 3; reasons.push('umpire identified'); }
  if (input.park && input.park.name !== 'neutral') { score += 4; reasons.push('park profile loaded'); }
  const talentGap = Math.abs(homeOff - awayOff) + Math.abs(homeDef - awayDef);
  if (talentGap > 1.5) { score += 10; reasons.push('large talent gap'); }
  else if (talentGap > 0.7) { score += 6; reasons.push('moderate talent gap'); }
  else { score += 2; reasons.push('teams comparable'); }
  if (warnings.length) { score -= 15 * warnings.length; reasons.push(`${warnings.length} input gap${warnings.length === 1 ? '' : 's'}`); }
  // CI relative width as a proxy — looser threshold so it actually fires
  const ciWidth = (ci95.high - ci95.low) / Math.max(1, expectedTotal);
  if (ciWidth < 0.7) { score += 4; reasons.push('tight CI'); }
  else if (ciWidth < 0.85) { score += 2; reasons.push('reasonable CI'); }
  score = Math.max(0, Math.min(100, score));
  const level: Confidence['level'] = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  const confidence: Confidence = { level, score, reasons };

  return {
    expectedHomeRuns,
    expectedAwayRuns,
    expectedTotal,
    components: [
      { side: 'home', label: 'Home expected runs', runs: expectedHomeRuns },
      { side: 'away', label: 'Away expected runs', runs: expectedAwayRuns },
    ],
    modifiers,
    ci80,
    ci95,
    pHomeWin,
    confidence,
    warnings,
  };
}

/**
 * Weather multiplier on run scoring.
 *
 *   Temperature: each 10°F above 70°F → +1.5% offense (warmer air, ball
 *   carries; documented in multiple Statcast/Fangraphs studies). Symmetric
 *   below 70.
 *
 *   Wind: out (CF/LF/RF) → +HR, +runs. In → −. Crosswinds neutral.
 *   Effect scales with wind speed (clipped at 20 mph) at ~0.6% per mph.
 *
 *   Closed-roof retractable parks: weather contribution zeroed out when
 *   condition includes "Roof Closed" or "Dome" (best-effort string match).
 *
 *   Precipitation reduces offense slightly (poor grip, slick balls): −2%
 *   for "Drizzle"/"Rain"/"Showers".
 *
 *   Returns a single named multiplier so the UI can show *why* the total
 *   moved.
 */
function weatherMultiplier(weather: WeatherInput | undefined, park: ParkProfile): Component {
  if (!weather) {
    return { name: 'Weather', multiplier: 1, note: 'No weather data provided' };
  }
  const indoor =
    park.retractable === true &&
    /closed|dome/i.test(weather.condition ?? '');
  if (indoor) {
    return { name: 'Weather', multiplier: 1, note: 'Roof closed · weather neutralized' };
  }

  let mult = 1;
  const notes: string[] = [];

  if (typeof weather.tempF === 'number') {
    const delta = weather.tempF - 70;
    const tempEffect = 1 + 0.0015 * delta; // 0.15% per °F from 70
    mult *= tempEffect;
    notes.push(`${weather.tempF}°F (${((tempEffect - 1) * 100).toFixed(1)}%)`);
  }

  if (typeof weather.windSpeedMph === 'number' && weather.windDir) {
    const speed = Math.min(20, weather.windSpeedMph);
    const dir = weather.windDir.toLowerCase();
    let windEffect = 1;
    if (/out\s+to|out to/.test(dir)) windEffect = 1 + 0.006 * speed;
    else if (/in\s+from|in from/.test(dir)) windEffect = 1 - 0.006 * speed;
    if (windEffect !== 1) {
      mult *= windEffect;
      notes.push(`wind ${weather.windDir} ${speed}mph (${((windEffect - 1) * 100).toFixed(1)}%)`);
    }
  }

  if (weather.condition && /drizzle|rain|shower/i.test(weather.condition)) {
    mult *= 0.98;
    notes.push('precip −2%');
  }

  return {
    name: 'Weather',
    multiplier: mult,
    note: notes.length ? notes.join(' · ') : `${weather.condition ?? ''} · neutral`,
  };
}

/**
 * Travel + rest multiplier.
 *
 * Travel (visiting club only): the empirical literature on MLB travel is
 * small but consistent — cross-country trips (>2000 miles) and short-rest
 * back-to-back red-eye scenarios shave ~0.5% off offense. Linear up to
 * 3000mi.
 *
 * Rest: 2+ days rest gives a small boost (~0.5%) due to bullpen freshness
 * and reduced fatigue. Coming off a doubleheader (0 days rest) → -0.5%.
 *
 * Numbers are conservative; we don't claim more than directional.
 */
function travelRestMultiplier(travel: TravelRestInput | undefined): Component[] {
  const out: Component[] = [];
  if (!travel) {
    return [{ name: 'Travel/Rest', multiplier: 1, note: 'No travel data' }];
  }
  const miles = travel.awayTravelMiles ?? 0;
  let travelMult = 1;
  if (miles > 500) {
    // up to 3000mi → up to −0.5% on visitor offense (we apply to total for simplicity)
    const factor = Math.min((miles - 500) / 2500, 1);
    travelMult = 1 - 0.005 * factor;
  }
  out.push({
    name: 'Travel',
    multiplier: travelMult,
    note: miles > 500
      ? `Away club traveled ~${Math.round(miles)} mi (${((travelMult - 1) * 100).toFixed(2)}%)`
      : `Short trip (${Math.round(miles)} mi) · negligible`,
  });

  const ar = travel.awayDaysRest ?? 1;
  const hr = travel.homeDaysRest ?? 1;
  let restMult = 1;
  const avgRest = (ar + hr) / 2;
  if (avgRest >= 2) restMult = 1.003;
  else if (avgRest <= 0) restMult = 0.995;
  out.push({
    name: 'Rest',
    multiplier: restMult,
    note: `Home ${hr}d · Away ${ar}d (${((restMult - 1) * 100).toFixed(2)}%)`,
  });
  return out;
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 26.2.17 approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-(z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

// ── Player game-line props ──────────────────────────────────────────────────

export type BatterPropInput = {
  pa: number; // expected plate appearances this game
  avg: number; // batter season AVG (or split vs opp hand if available)
  obp: number;
  slg: number;
  iso?: number; // SLG-AVG
  homeRunRate?: number; // HR / AB
  doublesPerAb?: number;
  walkRate?: number; // BB / PA
  kRate?: number;    // K  / PA
  oppPitcherKRate?: number; // opp K%
  oppPitcherBBrate?: number; // opp BB%
  oppPitcherHRrate?: number; // HR per AB allowed
  parkHrFactor?: number; // 100-scaled
  parkHFactor?: number;
  parkSoFactor?: number;
  umpKZBoost?: number;   // 1.0 = neutral; >1 ump expands strike zone (more Ks, fewer BBs)
  weatherMult?: number; // share of the run-total weather mult
};

export type BatterProp = {
  expectedHits: number;
  expectedTotalBases: number;
  expectedDoubles: number;
  expectedHRs: number;
  expectedWalks: number;
  expectedStrikeouts: number;
  pHit1Plus: number;
  pHit2Plus: number;
  pHrAtLeastOne: number;
  pBb1Plus: number;
  pK1Plus: number;
  pDouble1Plus: number;
  confidence: Confidence;
};

/**
 * Project per-batter outputs for the game.
 *
 *   AB ≈ PA * 0.91 (subtract walks/HBP at MLB-wide ~9% non-AB rate).
 *   Hit probability per AB ≈ AVG, modulated by:
 *     - opponent pitcher K-rate (lower contact → fewer hits): hit_p *= (1 - 0.5*(oppK - .22))
 *     - park hits factor (parkH / 100)
 *     - weather (only flyball/HR portion meaningfully, scaled small)
 *   HR per AB modulated by: park HR factor * pitcher HR-allowed factor.
 *
 * Probabilities derived via binomial distribution of independent ABs.
 */
export function predictBatterProp(input: BatterPropInput): BatterProp {
  const pa = Math.max(0, input.pa);
  const ab = Math.max(0, pa * 0.91);
  const baseAvg = input.avg || 0;
  const kAdj = input.oppPitcherKRate != null
    ? 1 - 0.5 * Math.max(-0.1, Math.min(0.1, input.oppPitcherKRate - 0.22))
    : 1;
  const parkAdj = (input.parkHFactor ?? 100) / 100;
  const wxAdj = input.weatherMult ?? 1;
  const umpKZ = input.umpKZBoost ?? 1; // >1 = wider zone, more Ks / fewer BBs

  const pHit = clamp01(baseAvg * kAdj * parkAdj * wxAdj);
  const expectedHits = ab * pHit;

  // HR per AB
  const baseHr = input.homeRunRate ?? Math.max(0, (input.iso ?? 0) * 0.25);
  const hrPark = (input.parkHrFactor ?? 100) / 100;
  const hrPitcher = input.oppPitcherHRrate != null ? (1 + input.oppPitcherHRrate * 1.5) : 1;
  const pHr = clamp01(baseHr * hrPark * hrPitcher * wxAdj);
  const expectedHRs = ab * pHr;

  // 2B per AB — rough; default 0.045 (MLB-wide ~5%)
  const base2b = input.doublesPerAb ?? 0.045;
  const p2b = clamp01(base2b * parkAdj * wxAdj);
  const expectedDoubles = ab * p2b;

  // Walk rate per PA
  const baseBB = input.walkRate ?? 0.085;
  const oppBBAdj = input.oppPitcherBBrate != null ? (input.oppPitcherBBrate / 0.085) : 1;
  const pBB = clamp01(baseBB * oppBBAdj / umpKZ); // wider zone → fewer walks
  const expectedWalks = pa * pBB;

  // K rate per PA
  const baseK = input.kRate ?? 0.22;
  const parkSO = (input.parkSoFactor ?? 100) / 100;
  const oppKAdj = input.oppPitcherKRate != null ? (input.oppPitcherKRate / 0.22) : 1;
  const pK = clamp01(baseK * oppKAdj * parkSO * umpKZ);
  const expectedKs = pa * pK;

  // Total bases from SLG
  const expectedSlg = (input.slg || 0) * parkAdj * wxAdj;
  const expectedTotalBases = ab * expectedSlg;

  // Event probabilities (binomial tails)
  const pHit1Plus = 1 - Math.pow(1 - pHit, ab);
  const pHit2Plus = Math.max(0, 1 - Math.pow(1 - pHit, ab) - ab * pHit * Math.pow(1 - pHit, ab - 1));
  const pHrAtLeastOne = 1 - Math.pow(1 - pHr, ab);
  const pDouble1Plus = 1 - Math.pow(1 - p2b, ab);
  const pBb1Plus = 1 - Math.pow(1 - pBB, pa);
  const pK1Plus = 1 - Math.pow(1 - pK, pa);

  // Confidence — driven by sample size of player's season + presence of opp data
  const reasons: string[] = [];
  let score = 40;
  // proxy for sample: pa here is the per-game prediction; underlying season AVG carries
  // sample weight. We use the season AVG presence + opp data as a proxy.
  if (baseAvg > 0) { score += 15; reasons.push('season AVG present'); }
  if (input.oppPitcherKRate != null) { score += 12; reasons.push('opp pitcher K-rate known'); }
  if (input.oppPitcherHRrate != null) { score += 8; reasons.push('opp pitcher HR-rate known'); }
  if (input.oppPitcherBBrate != null) { score += 6; reasons.push('opp pitcher BB-rate known'); }
  if ((input.parkHrFactor ?? 100) !== 100 || (input.parkHFactor ?? 100) !== 100) { score += 6; reasons.push('park factors applied'); }
  if (input.weatherMult && input.weatherMult !== 1) { score += 5; reasons.push('weather modifier applied'); }
  score = Math.max(0, Math.min(100, score));
  const level: Confidence['level'] = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
  const confidence: Confidence = { level, score, reasons };

  return {
    expectedHits,
    expectedTotalBases,
    expectedDoubles,
    expectedHRs,
    expectedWalks,
    expectedStrikeouts: expectedKs,
    pHit1Plus,
    pHit2Plus,
    pHrAtLeastOne,
    pBb1Plus,
    pK1Plus,
    pDouble1Plus,
    confidence,
  };
}

export type PitcherPropInput = {
  oppKRate: number; // opponent team K%
  oppBBRate?: number;
  pitcherK9: number; // season K/9
  pitcherBB9?: number;
  pitcherHR9?: number;
  pitcherWhip?: number;
  pitcherIpPerStart: number; // bulk
  parkSoFactor?: number; // 100-scaled
  parkHrFactor?: number; // 100-scaled
  umpKZBoost?: number;   // >1 → more Ks, fewer BBs
  weatherMult?: number;
};

export type PitcherProp = {
  expectedStrikeouts: number;
  expectedWalks: number;
  expectedHits: number;
  expectedHRs: number;
  expectedEarnedRuns: number;
  pSixPlus: number;
  pEightPlus: number;
  pTenPlus: number;
  confidence: Confidence;
};

/**
 * Project starter K total.
 *   Expected innings = pitcherIpPerStart (capped).
 *   Per-IP K rate = pitcherK9 / 9, modulated up/down by opp team K-rate
 *   relative to MLB-wide ~22%, and by park SO factor.
 *
 * Distribution approximated as Poisson on expected Ks; we report
 *   P(≥6) and P(≥8) via Poisson tail.
 */
export function predictPitcherProp(input: PitcherPropInput): PitcherProp {
  const ip = Math.min(7.5, Math.max(2.5, input.pitcherIpPerStart || 5.5));
  const umpKZ = input.umpKZBoost ?? 1;
  const wxAdj = input.weatherMult ?? 1;

  // K
  const baseK = (input.pitcherK9 || 8) / 9;
  const oppKAdj = 1 + Math.max(-0.5, Math.min(0.5, (input.oppKRate - 0.22) * 2));
  const parkSO = (input.parkSoFactor ?? 100) / 100;
  const expectedK = ip * baseK * oppKAdj * parkSO * umpKZ;

  // BB
  const baseBB = (input.pitcherBB9 ?? 3) / 9;
  const oppBBAdj = input.oppBBRate != null ? input.oppBBRate / 0.085 : 1;
  const expectedBB = ip * baseBB * oppBBAdj / umpKZ;

  // Hits — derive from WHIP minus BB
  const whip = input.pitcherWhip ?? 1.30;
  const expectedHRunner = ip * Math.max(0, whip - baseBB);
  const expectedHits = expectedHRunner * (1 / wxAdj); // weather wash; favored offense → more hits

  // HR
  const baseHR = (input.pitcherHR9 ?? 1.2) / 9;
  const parkHR = (input.parkHrFactor ?? 100) / 100;
  const expectedHRs = ip * baseHR * parkHR * wxAdj;

  // ER — back into it via ERA proxy if not in input. Use FIP-style estimate:
  //   ER/9 ≈ 13*HR/9 + 3*BB/9 - 2*K/9 + constant 3.10
  const era9 = 13 * (expectedHRs * 9 / Math.max(1, ip)) + 3 * (expectedBB * 9 / Math.max(1, ip)) - 2 * (expectedK * 9 / Math.max(1, ip)) + 3.1;
  const expectedER = Math.max(0, (era9 / 9) * ip);

  const pSixPlus = 1 - poissonCdf(5, expectedK);
  const pEightPlus = 1 - poissonCdf(7, expectedK);
  const pTenPlus = 1 - poissonCdf(9, expectedK);

  // Confidence
  const reasons: string[] = [];
  let score = 40;
  if (input.pitcherK9 > 0) { score += 14; reasons.push('K/9 known'); }
  if (input.pitcherWhip != null) { score += 8; reasons.push('WHIP known'); }
  if (input.pitcherBB9 != null) { score += 6; reasons.push('BB/9 known'); }
  if (input.pitcherHR9 != null) { score += 6; reasons.push('HR/9 known'); }
  if (input.oppKRate > 0 && input.oppKRate !== 0.22) { score += 8; reasons.push('opp K% known'); }
  if (input.weatherMult && input.weatherMult !== 1) { score += 4; reasons.push('weather applied'); }
  if (input.umpKZBoost && input.umpKZBoost !== 1) { score += 6; reasons.push('umpire KZ applied'); }
  if (ip < 4) { score -= 10; reasons.push('low IP volume'); }
  score = Math.max(0, Math.min(100, score));
  const level: Confidence['level'] = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
  const confidence: Confidence = { level, score, reasons };

  return {
    expectedStrikeouts: expectedK,
    expectedWalks: expectedBB,
    expectedHits,
    expectedHRs,
    expectedEarnedRuns: expectedER,
    pSixPlus,
    pEightPlus,
    pTenPlus,
    confidence,
  };
}

function poissonCdf(k: number, lambda: number): number {
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i <= k; i++) {
    if (i === 0) sum += term;
    else {
      term = (term * lambda) / i;
      sum += term;
    }
  }
  return Math.min(1, Math.max(0, sum));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// ── First 5 Innings (F5) ─────────────────────────────────────────────────────

/**
 * Predict first-5-inning outcomes — the popular F5 segment.
 *
 * Why a separate model
 * --------------------
 *   In F5, the starting pitcher carries ~95% of the workload (avg starter
 *   IP/start ≈ 5.3 in 2024-26). The bullpen barely matters, lineup turnover
 *   is mostly first time through the order, and the starter's true talent
 *   dominates run prevention. The full-game model blends starter and
 *   bullpen — F5 should anchor on the starter.
 *
 * Core math
 * ---------
 *   For each side: expected_runs_F5 = inningsCovered × (offensive R/9 / 9)
 *     where offensive R/9 = a Log5 blend of team RS/G with the opposing
 *     starter's RA/9 proxy (FIP). The starter handles min(5, IP/start)
 *     innings; any leftover ⌈x/9⌉ uses team RA/G.
 *
 *   Then × park, weather, umpire — same multiplicative modifiers as the
 *   full-game model, only applied across F5 instead of 9 innings.
 *
 * Distribution & probabilities
 * ----------------------------
 *   Total F5 runs ~ Poisson(λ_F5_total) with overdispersion ψ=1.4
 *   (F5 has slightly less overdispersion than full game). Normal approx
 *   for CI and home win prob.
 *
 *   P(F5 over X.5) via Poisson tail.
 *   P(NRFI — no runs in first inning) = P(0 runs given lambda_per_inning).
 */

const F5_OVERDISPERSION = 1.4;
const F5_LEAGUE_AVG_RPG = 4.5;

export type First5Input = RunTotalInput; // same input set; we just re-interpret horizon

export type First5Output = {
  expectedHomeRuns: number;
  expectedAwayRuns: number;
  expectedTotal: number;
  modifiers: Component[];
  ci80: { low: number; high: number };
  ci95: { low: number; high: number };
  pHomeWin: number;
  pTotalOver: { line: number; prob: number }[]; // 2.5, 3.5, 4.5, 5.5
  pNRFI: number; // No Runs in First Inning
  // Per-starter projected F5 lines (through their inn share of 5)
  starters: {
    away: First5StarterLine | null;
    home: First5StarterLine | null;
  };
  confidence: Confidence;
  warnings: string[];
};

export type First5StarterLine = {
  inningsCovered: number;
  expectedK: number;
  expectedBB: number;
  expectedHits: number;
  expectedHRs: number;
  expectedRuns: number; // ER through F5 share
};

export function predictFirst5(input: First5Input): First5Output {
  const modifiers: Component[] = [];
  const warnings: string[] = [];

  const homeOff = input.home.runsScoredPerGame || F5_LEAGUE_AVG_RPG;
  const awayOff = input.away.runsScoredPerGame || F5_LEAGUE_AVG_RPG;
  if (!input.home.runsScoredPerGame) warnings.push('Home offense run rate missing — using league average.');
  if (!input.away.runsScoredPerGame) warnings.push('Away offense run rate missing — using league average.');

  // Starter run-prevention proxy: FIP is on the ERA scale
  const starterRA = (sp?: StarterInput): number | null => sp?.fip ?? null;

  const homeStartRA = starterRA(input.homeStarter);
  const awayStartRA = starterRA(input.awayStarter);

  // Cover up to 5 innings with the starter, anything past that is bullpen (team RA/G as proxy)
  const homeStartIP = Math.min(5, Math.max(2, input.homeStarter?.ipPerStart ?? 5));
  const awayStartIP = Math.min(5, Math.max(2, input.awayStarter?.ipPerStart ?? 5));

  function teamF5Runs(off: number, oppStartRA: number | null, oppStartIP: number, oppTeamRA: number): number {
    // Per-inning rates
    const offPerInn = off / 9;
    const starterRAperInn = (oppStartRA ?? oppTeamRA) / 9;
    const teamRAperInn = oppTeamRA / 9;

    // Log5-style on per-inning rates (anchor at league avg per inning)
    const lgPerInn = F5_LEAGUE_AVG_RPG / 9;
    const expStarterShare = oppStartIP * (offPerInn / lgPerInn) * (starterRAperInn / lgPerInn) * lgPerInn;
    const bullpenInn = Math.max(0, 5 - oppStartIP);
    const expBullpenShare = bullpenInn * (offPerInn / lgPerInn) * (teamRAperInn / lgPerInn) * lgPerInn;
    return expStarterShare + expBullpenShare;
  }

  const homeF5Raw = teamF5Runs(homeOff, awayStartRA, awayStartIP, input.away.runsAllowedPerGame || F5_LEAGUE_AVG_RPG);
  const awayF5Raw = teamF5Runs(awayOff, homeStartRA, homeStartIP, input.home.runsAllowedPerGame || F5_LEAGUE_AVG_RPG);

  // Modifiers (park, weather, ump — applied to F5 instead of full game)
  const parkMult = (input.park.runs ?? 100) / 100;
  modifiers.push({ name: 'Park', multiplier: parkMult, note: `${input.park.name} · runs factor ${input.park.runs}` });

  const wx = weatherMultiplier(input.weather, input.park);
  modifiers.push(wx);

  // Travel/rest are full-game effects, very small for F5; we still expose them but at half magnitude
  if (input.travel) {
    const tr = travelRestMultiplier(input.travel);
    for (const c of tr) {
      const halved = 1 + (c.multiplier - 1) * 0.5;
      modifiers.push({ name: c.name, multiplier: halved, note: `${c.note} (F5 half-weight)` });
    }
  } else {
    modifiers.push({ name: 'Travel/Rest', multiplier: 1, note: 'No travel data' });
  }

  if (input.umpire) {
    const ump = input.umpire;
    const mult = ump.runsModifier ?? 1;
    modifiers.push({
      name: 'Umpire',
      multiplier: mult,
      note: ump.name
        ? `${ump.name}${ump.kzBoost && ump.kzBoost !== 1 ? ` · KZ ${ump.kzBoost > 1 ? '+' : ''}${((ump.kzBoost - 1) * 100).toFixed(0)}%` : ' · neutral'}`
        : 'No ump data — assumed neutral',
    });
  }

  const totalMult = modifiers.reduce((m, c) => m * c.multiplier, 1);
  const expectedHomeRuns = homeF5Raw * totalMult;
  const expectedAwayRuns = awayF5Raw * totalMult;
  const expectedTotal = expectedHomeRuns + expectedAwayRuns;

  // CIs — Poisson with overdispersion, normal approx
  const variance = F5_OVERDISPERSION * expectedTotal;
  const sd = Math.sqrt(variance);
  const ci80 = { low: Math.max(0, expectedTotal - 1.282 * sd), high: expectedTotal + 1.282 * sd };
  const ci95 = { low: Math.max(0, expectedTotal - 1.96 * sd), high: expectedTotal + 1.96 * sd };

  // Home win prob (F5 only — ties possible, modeled as normal on diff and we count P(diff>0))
  const diffMean = expectedHomeRuns - expectedAwayRuns;
  const diffSD = Math.sqrt(F5_OVERDISPERSION * (expectedHomeRuns + expectedAwayRuns));
  const z = diffSD > 0 ? diffMean / diffSD : 0;
  const pHomeWin = normalCdf(z);

  // P(F5 over X.5) via Poisson tail on expectedTotal
  const pTotalOver = [2.5, 3.5, 4.5, 5.5, 6.5].map((line) => ({
    line,
    prob: 1 - poissonCdf(Math.floor(line), expectedTotal),
  }));

  // P(NRFI) — no runs in first inning. Lambda_first ≈ totalLambda / 5.
  const lambdaFirstInning = expectedTotal / 5;
  const pNRFI = Math.exp(-lambdaFirstInning);

  // Per-starter projected lines through their F5 share
  const starters = {
    away: starterLine(input.awayStarter, awayStartIP, input.home, input.park, totalMult, input.umpire?.kzBoost ?? 1),
    home: starterLine(input.homeStarter, homeStartIP, input.away, input.park, totalMult, input.umpire?.kzBoost ?? 1),
  };

  // Confidence
  const reasons: string[] = [];
  let score = 50;
  if (input.homeStarter?.fip) { score += 12; reasons.push('home starter FIP known'); }
  if (input.awayStarter?.fip) { score += 12; reasons.push('away starter FIP known'); }
  if (input.weather && (input.weather.tempF || input.weather.windSpeedMph)) { score += 6; reasons.push('weather data present'); }
  if ((ci95.high - ci95.low) / Math.max(1, expectedTotal) < 0.7) { score += 6; reasons.push('tight CI'); }
  if (warnings.length) { score -= 12 * warnings.length; reasons.push(`${warnings.length} input gap${warnings.length === 1 ? '' : 's'}`); }
  score = Math.max(0, Math.min(100, score));
  const level: Confidence['level'] = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
  const confidence: Confidence = { level, score, reasons };

  return {
    expectedHomeRuns,
    expectedAwayRuns,
    expectedTotal,
    modifiers,
    ci80,
    ci95,
    pHomeWin,
    pTotalOver,
    pNRFI,
    starters,
    confidence,
    warnings,
  };
}

function starterLine(
  starter: StarterInput | undefined,
  inningsCovered: number,
  oppOff: TeamOffenseDefense,
  park: ParkProfile,
  weatherTotalMult: number,
  umpKZ: number
): First5StarterLine | null {
  if (!starter) return null;

  // Synthesize per-inning rates from the starter object — use sensible defaults if missing
  // FIP gives ER scale; we infer K/BB/HR/Hit rates from the starter's expected ERA-equivalent.
  // For a more accurate per-stat decomposition we'd want pitcherK9/BB9/HR9 — those are NOT
  // on StarterInput today, so we use the starter's FIP plus league-average ratios.
  const fip = starter.fip ?? 4.10;
  // Rough per-9 split from a typical pitcher with this FIP — using:
  //   K/9 ≈ scale relative to league 8.5
  //   BB/9 ≈ from FIP residual (higher FIP usually = more BB+HR)
  // This is intentionally simple — the per-pitcher prop endpoint on the game page gives
  // the high-fidelity numbers; this is a quick rollup for the F5 view.
  const k9Estimate = Math.max(5, Math.min(13, 8.5 + (4.10 - fip) * 1.2));
  const bb9Estimate = Math.max(1.5, Math.min(5.5, 3.0 + (fip - 4.10) * 0.6));
  const hr9Estimate = Math.max(0.6, Math.min(2.0, 1.2 + (fip - 4.10) * 0.4));
  const whipEstimate = Math.max(0.95, Math.min(1.55, 1.30 + (fip - 4.10) * 0.05));

  const expectedK = inningsCovered * (k9Estimate / 9) * umpKZ * ((park.so ?? 100) / 100);
  const expectedBB = inningsCovered * (bb9Estimate / 9) / umpKZ;
  const expectedHRs = inningsCovered * (hr9Estimate / 9) * ((park.hr ?? 100) / 100) * weatherTotalMult;
  const expectedHits = inningsCovered * Math.max(0, whipEstimate - bb9Estimate / 9);
  // ER via FIP scaled to inningsCovered, weather modulated
  const expectedRuns = inningsCovered * (fip / 9) * weatherTotalMult;

  return {
    inningsCovered,
    expectedK,
    expectedBB,
    expectedHits,
    expectedHRs,
    expectedRuns,
  };
}
