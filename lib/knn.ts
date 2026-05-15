/**
 * k-Nearest-Neighbors comparables across the active player pool.
 *
 * Each player is a vector of rate stats normalized to z-scores across the
 * corpus. Distance is Euclidean. The 5 closest players (excluding self)
 * are returned with similarity = 1 / (1 + distance).
 */

export type CompVector = {
  id: number;
  name: string;
  teamId?: number;
  teamName?: string;
  pos?: string;
  features: number[];
};

export type CompResult = {
  id: number;
  name: string;
  teamId?: number;
  teamName?: string;
  pos?: string;
  similarity: number;
  distance: number;
};

export function buildHitterCorpus(splits: any[]): CompVector[] {
  return splits
    .filter((sp) => Number(sp.stat?.plateAppearances ?? 0) >= 30)
    .map((sp) => {
      const s = sp.stat;
      const pa = Number(s.plateAppearances);
      const ab = Number(s.atBats) || 1;
      return {
        id: sp.player.id,
        name: sp.player.fullName,
        teamId: sp.team?.id,
        teamName: sp.team?.name,
        pos: sp.position?.abbreviation,
        features: [
          parseFloat(s.avg ?? '0'),
          parseFloat(s.obp ?? '0'),
          parseFloat(s.slg ?? '0'),
          (Number(s.homeRuns) || 0) / ab, // HR rate
          (Number(s.strikeOuts) || 0) / pa, // K%
          (Number(s.baseOnBalls) || 0) / pa, // BB%
          (Number(s.stolenBases) || 0) / Math.max(1, Number(s.gamesPlayed) || 1),
        ],
      };
    });
}

export function buildPitcherCorpus(splits: any[]): CompVector[] {
  return splits
    .filter((sp) => {
      const ip = sp.stat?.inningsPitched ?? '0';
      const whole = parseFloat(String(ip).split('.')[0]) || 0;
      return whole >= 10;
    })
    .map((sp) => {
      const s = sp.stat;
      return {
        id: sp.player.id,
        name: sp.player.fullName,
        teamId: sp.team?.id,
        teamName: sp.team?.name,
        pos: sp.position?.abbreviation,
        features: [
          parseFloat(s.era ?? '0'),
          parseFloat(s.whip ?? '0'),
          parseFloat(s.strikeoutsPer9Inn ?? '0'),
          parseFloat(s.walksPer9Inn ?? '0'),
          parseFloat(s.homeRunsPer9 ?? '0'),
          parseFloat(s.avg ?? '0'), // opp avg
        ],
      };
    });
}

function zScore(corpus: CompVector[]): CompVector[] {
  if (!corpus.length) return corpus;
  const dim = corpus[0].features.length;
  const means = new Array(dim).fill(0);
  const sds = new Array(dim).fill(0);
  for (let d = 0; d < dim; d++) {
    means[d] = corpus.reduce((s, v) => s + v.features[d], 0) / corpus.length;
  }
  for (let d = 0; d < dim; d++) {
    const variance = corpus.reduce((s, v) => s + (v.features[d] - means[d]) ** 2, 0) / corpus.length;
    sds[d] = Math.sqrt(variance) || 1;
  }
  return corpus.map((v) => ({
    ...v,
    features: v.features.map((x, d) => (x - means[d]) / sds[d]),
  }));
}

export function findComparables(
  targetId: number,
  corpus: CompVector[],
  k: number = 5
): CompResult[] {
  const zc = zScore(corpus);
  const target = zc.find((v) => v.id === targetId);
  if (!target) return [];
  const others = zc.filter((v) => v.id !== targetId);
  const scored = others.map((v) => {
    const dist = Math.sqrt(
      v.features.reduce((s, x, i) => s + (x - target.features[i]) ** 2, 0)
    );
    return {
      id: v.id,
      name: v.name,
      teamId: v.teamId,
      teamName: v.teamName,
      pos: v.pos,
      distance: dist,
      similarity: 1 / (1 + dist),
    };
  });
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, k);
}
