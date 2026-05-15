/**
 * Pre-game win probability — a simple, transparent baseline model.
 *
 * Inputs we have at preview time:
 *   - season runs scored / allowed for both clubs
 *   - home field advantage (~54% league baseline)
 *
 * Approach: Log5 (Bill James) on each team's "true talent" winning %, then
 * multiply by a home-field bump. This is intentionally simple — a logistic
 * regression on FIP/wRC+/bullpen would do better, and we'd need historical
 * data to fit it. We expose this model for transparency in /lab.
 *
 * References:
 *   - Log5: Bill James, 1981 Baseball Abstract
 *   - MLB home WP ~ .540 historically (varies year by year)
 */

const HOME_FIELD = 0.54;

export function log5(pA: number, pB: number, neutral = 0.5): number {
  // Probability A beats B given each beats league-average at rate pA, pB
  const num = pA - pA * pB;
  const den = pA + pB - 2 * pA * pB;
  if (den === 0) return neutral;
  return num / den;
}

export function preGameHomeWP(
  homeRunDiffPct: number, // runs/game − league avg, or 0
  awayRunDiffPct: number,
  homePyth: number, // 0–1 from Pythagorean
  awayPyth: number
): { homeWP: number; confidence: 'low' | 'medium' | 'high' } {
  // Use Pythagorean as the "true talent" proxy
  const base = log5(homePyth, awayPyth);
  // Apply home field. We shift the win-prob via odds ratio.
  const odds = (base / (1 - base)) * (HOME_FIELD / (1 - HOME_FIELD));
  const homeWP = odds / (1 + odds);
  // Confidence is heuristic — sample size matters; we don't have games-played in this fn
  const gap = Math.abs(homePyth - awayPyth);
  const confidence = gap > 0.08 ? 'medium' : 'low';
  return { homeWP, confidence };
}
