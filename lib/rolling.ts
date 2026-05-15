/**
 * Rolling-window stats with regression-to-mean bands.
 *
 * Given a game log of per-game counting stats, compute a rolling window of
 * a derived rate (e.g. wOBA). Bands are a Wilson-style confidence interval
 * around the rate, shrinking as PA accumulates — visually telling the user
 * "we're more sure of this number when the window has more events."
 */
import { woba, obp, slg, parseInnings, fip, k9 } from './saber';
import type { RollingPoint } from '@/components/RollingChart';

export type MetricKey = 'avg' | 'obp' | 'slg' | 'ops' | 'woba' | 'k9' | 'fip';

const metricExtractors: Record<MetricKey, (cum: Record<string, number>) => number> = {
  avg: (c) => (c.atBats ? c.hits / c.atBats : 0),
  obp: (c) => obp(c),
  slg: (c) => slg(c),
  ops: (c) => obp(c) + slg(c),
  woba: (c) => woba(c),
  k9: (c) => k9({ ...c, inningsPitched: c.outsRecorded / 3 }),
  fip: (c) => fip({ ...c, inningsPitched: c.outsRecorded / 3 }),
};

const HITTING_FIELDS = [
  'atBats', 'hits', 'doubles', 'triples', 'homeRuns',
  'baseOnBalls', 'intentionalWalks', 'hitByPitch', 'sacFlies',
  'strikeOuts', 'plateAppearances',
] as const;

const PITCHING_FIELDS = [
  'hits', 'homeRuns', 'baseOnBalls', 'hitByPitch', 'strikeOuts',
] as const;

export function buildRolling(
  gameLog: any[],
  metric: MetricKey,
  windowSize: number,
  isPitching: boolean = false
): RollingPoint[] {
  const fields = isPitching ? PITCHING_FIELDS : HITTING_FIELDS;
  const extract = metricExtractors[metric];
  const out: RollingPoint[] = [];

  for (let i = 0; i < gameLog.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = gameLog.slice(start, i + 1);
    const cum: Record<string, number> = {};
    for (const f of fields) cum[f] = 0;
    let outsRecorded = 0;
    for (const g of slice) {
      const s = g.stat ?? {};
      for (const f of fields) {
        cum[f] += Number(s[f] ?? 0);
      }
      if (isPitching) {
        outsRecorded += Math.round(parseInnings(s.inningsPitched) * 3);
      }
    }
    cum.outsRecorded = outsRecorded;

    const value = extract(cum);
    const denom = isPitching
      ? cum.outsRecorded / 3
      : cum.plateAppearances || cum.atBats || 1;
    // Wilson-style half-width on a Bernoulli rate proxy (visual band only)
    const variance = (value * (1 - Math.min(1, value))) / Math.max(1, denom);
    const sd = Math.sqrt(Math.max(0, variance));
    const halfWidth = 1.96 * sd;

    out.push({
      game: i + 1,
      date: gameLog[i].date ?? '',
      metric: value,
      upper: value + halfWidth,
      lower: Math.max(0, value - halfWidth),
    });
  }
  return out;
}
