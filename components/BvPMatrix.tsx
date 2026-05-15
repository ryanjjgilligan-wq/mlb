import Link from 'next/link';
import { Empty } from './ui/Empty';

export type BvPRow = {
  batterId: number;
  batterName: string;
  vs: any | null; // career split or null
};

export function BvPMatrix({
  rows,
  pitcherName,
  teamName,
}: {
  rows: BvPRow[];
  pitcherName: string;
  teamName: string;
}) {
  const withSamples = rows.filter((r) => r.vs && Number(r.vs.stat?.atBats ?? 0) > 0);

  return (
    <div className="p-3">
      <div className="label-micro mb-2 px-1 truncate">
        {teamName} batters · career vs {pitcherName}
      </div>
      {rows.length === 0 ? (
        <Empty title="No lineup posted yet" description="Comes online once batting orders are released." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
              <th className="text-left font-medium pb-1">Batter</th>
              <th className="text-right font-medium pb-1 w-10">PA</th>
              <th className="text-right font-medium pb-1 w-10">AB</th>
              <th className="text-right font-medium pb-1 w-10">H</th>
              <th className="text-right font-medium pb-1 w-10">2B</th>
              <th className="text-right font-medium pb-1 w-10">HR</th>
              <th className="text-right font-medium pb-1 w-10">BB</th>
              <th className="text-right font-medium pb-1 w-10">K</th>
              <th className="text-right font-medium pb-1 w-12">AVG</th>
              <th className="text-right font-medium pb-1 w-12">OPS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const s = r.vs?.stat ?? {};
              const ab = Number(s.atBats ?? 0);
              const ops = parseFloat(s.ops ?? '0');
              const hot = ab >= 8 && ops > 0.900;
              const cold = ab >= 8 && ops < 0.500;
              return (
                <tr key={r.batterId} className="row-hover border-t border-line-subtle">
                  <td className="py-1 pr-2">
                    <span className="text-2xs text-ink-faint stat-num mr-2 inline-block w-3">{i + 1}</span>
                    <Link href={`/player/${r.batterId}`} className="text-sm hover:text-accent">{r.batterName}</Link>
                  </td>
                  <Td v={s.plateAppearances} dim={!ab} />
                  <Td v={s.atBats} dim={!ab} />
                  <Td v={s.hits} dim={!ab} />
                  <Td v={s.doubles} dim={!ab} />
                  <Td v={s.homeRuns} dim={!ab} accent={Number(s.homeRuns) > 0} />
                  <Td v={s.baseOnBalls} dim={!ab} />
                  <Td v={s.strikeOuts} dim={!ab} />
                  <Td v={s.avg} dim={!ab} />
                  <td className={`text-right stat-num pl-2 ${hot ? 'text-signal-pos font-semibold' : cold ? 'text-signal-neg' : 'text-ink-muted'}`}>
                    {ab > 0 ? s.ops : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-2xs text-ink-faint mt-2">
        Career numbers from MLB Stats API. Hot tag (green) = ≥8 AB and OPS &gt; .900;
        cold tag (red) = ≥8 AB and OPS &lt; .500. Empty cells = no career PA.
      </p>
    </div>
  );
}

function Td({ v, dim, accent }: { v: any; dim?: boolean; accent?: boolean }) {
  return (
    <td className={`text-right stat-num pl-2 ${dim ? 'text-ink-faint' : accent ? 'text-accent' : 'text-ink-muted'}`}>
      {v ?? '—'}
    </td>
  );
}
