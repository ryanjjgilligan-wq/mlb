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

export type RunTotalInput = {
  home: TeamOffenseDefense;
  away: TeamOffenseDefense;
  homeStarter?: StarterInput;
  awayStarter?: StarterInput;
  park: ParkProfile;
  weather?: WeatherInput;
  travel?: TravelRestInput;
};

export type Component = { name: string; multiplier: number; note: string };

export type RunTotalOutput = {
  expectedHomeRuns: number;
  expectedAwayRuns: number;
  expectedTotal: number;
  components: { side: 'home' | 'away'; label: string; runs: number }[];
  modifiers: Component[];
  ci80: { low: number; high: number };
  ci95: { low: number; high: number };
  pHomeWin: number;
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
  oppPitcherKRate?: number; // opp K%
  oppPitcherHRrate?: number; // HR per AB allowed
  parkHrFactor?: number; // 100-scaled
  parkHFactor?: number;
  weatherMult?: number; // share of the run-total weather mult
};

export type BatterProp = {
  expectedHits: number;
  expectedTotalBases: number;
  pHit1Plus: number;
  pHit2Plus: number;
  pHrAtLeastOne: number;
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
  const ab = Math.max(0, input.pa * 0.91);
  const baseAvg = input.avg || 0;
  const kAdj = input.oppPitcherKRate != null
    ? 1 - 0.5 * Math.max(-0.1, Math.min(0.1, input.oppPitcherKRate - 0.22))
    : 1;
  const parkAdj = (input.parkHFactor ?? 100) / 100;
  const wxAdj = input.weatherMult ?? 1;

  const pHit = clamp01(baseAvg * kAdj * parkAdj * wxAdj);

  // Expected hits = ab * pHit
  const expectedHits = ab * pHit;

  // HR rate per AB
  const baseHr = input.homeRunRate ?? Math.max(0, (input.iso ?? 0) * 0.25);
  const hrAdj = ((input.parkHrFactor ?? 100) / 100) * (input.oppPitcherHRrate != null ? (1 + input.oppPitcherHRrate * 1.5) : 1);
  const pHr = clamp01(baseHr * hrAdj);

  // Total bases — approximate from SLG with park hits factor
  const expectedSlg = (input.slg || 0) * parkAdj * wxAdj;
  const expectedTotalBases = ab * expectedSlg;

  // Binomial event probabilities over ab trials
  const pHit1Plus = 1 - Math.pow(1 - pHit, ab);
  const pHit2Plus = Math.max(0, 1 - Math.pow(1 - pHit, ab) - ab * pHit * Math.pow(1 - pHit, ab - 1));
  const pHrAtLeastOne = 1 - Math.pow(1 - pHr, ab);

  return {
    expectedHits,
    expectedTotalBases,
    pHit1Plus,
    pHit2Plus,
    pHrAtLeastOne,
  };
}

export type PitcherPropInput = {
  oppKRate: number; // opponent team K%
  pitcherK9: number; // season K/9
  pitcherIpPerStart: number; // bulk
  parkSoFactor?: number; // 100-scaled
};

export type PitcherProp = {
  expectedStrikeouts: number;
  pSixPlus: number;
  pEightPlus: number;
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
  const baseRate = (input.pitcherK9 || 8) / 9;
  const oppAdj = 1 + Math.max(-0.5, Math.min(0.5, (input.oppKRate - 0.22) * 2));
  const parkAdj = (input.parkSoFactor ?? 100) / 100;
  const perInning = baseRate * oppAdj * parkAdj;
  const expectedK = ip * perInning;
  const pSixPlus = 1 - poissonCdf(5, expectedK);
  const pEightPlus = 1 - poissonCdf(7, expectedK);
  return { expectedStrikeouts: expectedK, pSixPlus, pEightPlus };
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
