/**
 * Cohort-based percentile estimation for a metric across the active player pool.
 *
 * Since we don't have a server-side league index pre-computed, we estimate
 * percentiles from a sample of the relevant cohort (the player's team + a
 * handful of leaderboard pulls). The result is approximate — clearly labeled.
 *
 * For a "real" version, replace with a nightly job that computes league-wide
 * percentiles per season and per qualified PA/IP threshold.
 */

export function percentileOf(value: number, distribution: number[], higherIsBetter = true): number {
  if (!distribution.length || !Number.isFinite(value)) return 50;
  const sorted = [...distribution].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  const equal = sorted.filter((v) => v === value).length;
  const pct = ((below + equal / 2) / sorted.length) * 100;
  return higherIsBetter ? pct : 100 - pct;
}
