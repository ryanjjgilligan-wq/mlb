import { fmtAvg } from '@/lib/saber';

export function SplitsTable({
  splits,
  isPitching,
}: {
  splits: any[];
  isPitching: boolean;
}) {
  if (!splits.length) {
    return <div className="py-6 text-2xs text-ink-faint text-center">No split data yet this season.</div>;
  }

  // Map sitCode → label
  const labels: Record<string, string> = {
    vl: 'vs LHP',
    vr: 'vs RHP',
    h: 'Home',
    a: 'Away',
    d: 'Day',
    n: 'Night',
  };

  const hitterCols = ['G', 'PA', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'BB%', 'K%'];
  const pitcherCols = ['G', 'IP', 'ERA', 'WHIP', 'K/9', 'BB/9', 'HR/9', 'OAvg'];
  const cols = isPitching ? pitcherCols : hitterCols;

  const ordered = ['vl', 'vr', 'h', 'a', 'd', 'n']
    .map((code) => splits.find((s) => s.split?.code === code))
    .filter(Boolean);

  if (!ordered.length) {
    return <div className="py-6 text-2xs text-ink-faint text-center">No matching splits returned.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
            <th className="text-left font-medium px-3 py-2">Split</th>
            {cols.map((c) => (
              <th key={c} className="text-right font-medium px-2 py-2">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((sp: any) => {
            const s = sp.stat ?? {};
            const pa = Number(s.plateAppearances ?? 0);
            const bbPct = pa ? (Number(s.baseOnBalls ?? 0) / pa) : 0;
            const kPct = pa ? (Number(s.strikeOuts ?? 0) / pa) : 0;
            return (
              <tr key={sp.split.code} className="row-hover border-b border-line-subtle last:border-0">
                <td className="px-3 py-1.5 text-ink">{labels[sp.split.code] ?? sp.split.description}</td>
                {isPitching ? (
                  <>
                    <Td v={s.gamesPlayed} />
                    <Td v={s.inningsPitched} />
                    <Td v={s.era} />
                    <Td v={s.whip} />
                    <Td v={s.strikeoutsPer9Inn} />
                    <Td v={s.walksPer9Inn} />
                    <Td v={s.homeRunsPer9} />
                    <Td v={s.avg} />
                  </>
                ) : (
                  <>
                    <Td v={s.gamesPlayed} />
                    <Td v={pa} />
                    <Td v={s.avg} />
                    <Td v={s.obp} />
                    <Td v={s.slg} />
                    <Td v={s.ops} />
                    <Td v={s.homeRuns} />
                    <td className="text-right stat-num text-ink-muted px-2 py-1.5">{(bbPct * 100).toFixed(1)}%</td>
                    <td className="text-right stat-num text-ink-muted px-2 py-1.5">{(kPct * 100).toFixed(1)}%</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Td({ v }: { v: any }) {
  return <td className="text-right stat-num text-ink-muted px-2 py-1.5">{v ?? '—'}</td>;
}
