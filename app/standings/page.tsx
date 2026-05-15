import Link from 'next/link';
import { getStandings } from '@/lib/mlb';
import { Panel } from '@/components/ui/Panel';
import { Tooltip } from '@/components/ui/Tooltip';
import { fmtAvg, fmtSigned, pythagorean } from '@/lib/saber';

export const revalidate = 300;
export const metadata = { title: 'Standings' };

export default async function StandingsPage() {
  const standings = await getStandings().catch(() => []);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Standings</h1>
        <p className="text-sm text-ink-muted mt-1">
          Expected W% derived from run differential via Pythagorean (exp 1.83). Δ = actual − expected.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {standings.map((div) => (
          <Panel
            key={div.division.id}
            title={div.division.name}
            subtitle={div.league?.name}
            flush
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                  <th className="text-left font-medium px-3 py-2">Team</th>
                  <th className="text-right font-medium px-2 py-2">W</th>
                  <th className="text-right font-medium px-2 py-2">L</th>
                  <th className="text-right font-medium px-2 py-2">PCT</th>
                  <th className="text-right font-medium px-2 py-2">GB</th>
                  <Th hint="Runs scored − Runs allowed">RD</Th>
                  <Th hint="Pythagorean expected winning percentage from run differential, exp 1.83.">EXP</Th>
                  <Th hint="Actual W% minus Pythagorean expected W%. Positive = outperforming run diff (regression candidate).">Δ</Th>
                  <th className="text-right font-medium px-3 py-2">STRK</th>
                </tr>
              </thead>
              <tbody>
                {div.teamRecords.map((tr) => {
                  const pyth = pythagorean(tr.runsScored ?? 0, tr.runsAllowed ?? 0);
                  const actual = parseFloat(tr.winningPercentage) || 0;
                  const diff = actual - pyth;
                  const rd = (tr.runsScored ?? 0) - (tr.runsAllowed ?? 0);
                  return (
                    <tr key={tr.team.id} className="row-hover border-b border-line-subtle last:border-0">
                      <td className="px-3 py-1.5">
                        <Link href={`/team/${tr.team.id}`} className="hover:text-accent">
                          {tr.team.name}
                        </Link>
                      </td>
                      <td className="text-right stat-num px-2 py-1.5">{tr.wins}</td>
                      <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{tr.losses}</td>
                      <td className="text-right stat-num px-2 py-1.5">{tr.winningPercentage}</td>
                      <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{tr.gamesBack}</td>
                      <td className={`text-right stat-num px-2 py-1.5 ${rd > 0 ? 'text-signal-pos' : rd < 0 ? 'text-signal-neg' : 'text-ink-muted'}`}>
                        {fmtSigned(rd, 0)}
                      </td>
                      <td className="text-right stat-num px-2 py-1.5 text-ink-muted">{fmtAvg(pyth)}</td>
                      <td className={`text-right stat-num px-2 py-1.5 ${diff > 0.02 ? 'text-signal-pos' : diff < -0.02 ? 'text-signal-neg' : 'text-ink-faint'}`}>
                        {fmtSigned(diff * 100, 1)}
                      </td>
                      <td className="text-right stat-num px-3 py-1.5 text-ink-muted">{tr.streak?.streakCode ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Th({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <th className="text-right font-medium px-2 py-2">
      <Tooltip content={hint}>
        <span className="border-b border-dotted border-line-strong cursor-help">{children}</span>
      </Tooltip>
    </th>
  );
}
