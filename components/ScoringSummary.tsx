import Link from 'next/link';
import { teamCapLogoUrl } from '@/lib/mlb';

export type ScoringSummaryData = {
  away: { id: number; abbr: string; name: string };
  home: { id: number; abbr: string; name: string };
  innings: Array<{ num: number; away?: { runs?: number }; home?: { runs?: number } }>;
  totals: {
    away: { runs: number; hits: number; errors: number };
    home: { runs: number; hits: number; errors: number };
  };
  scoringPlays?: Array<{
    inning: number;
    halfInning: 'top' | 'bottom';
    description: string;
    awayScore: number;
    homeScore: number;
  }>;
  currentInning?: number | null;
};

/**
 * Polished line-score with team logos, R/H/E totals, and a list of
 * scoring plays beneath. Mirrors the iconic broadcast scoring summary.
 */
export function ScoringSummary({ data }: { data: ScoringSummaryData }) {
  const totalInnings = Math.max(9, data.innings.length);
  const slots = Array.from({ length: totalInnings }, (_, i) => {
    const inn = data.innings.find((x) => x.num === i + 1);
    return { num: i + 1, away: inn?.away?.runs, home: inn?.home?.runs };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
            <th className="text-left font-medium px-3 py-2 w-32">Team</th>
            {slots.map((s) => (
              <th
                key={s.num}
                className={`text-center font-medium px-1.5 py-2 w-7 stat-num ${data.currentInning === s.num ? 'text-accent' : ''}`}
              >
                {s.num}
              </th>
            ))}
            <th className="text-center font-medium px-3 py-2 w-10 border-l border-line">R</th>
            <th className="text-center font-medium px-3 py-2 w-10">H</th>
            <th className="text-center font-medium px-3 py-2 w-10">E</th>
          </tr>
        </thead>
        <tbody>
          <ScoreRow team={data.away} slots={slots} which="away" totals={data.totals.away} currentInning={data.currentInning} />
          <ScoreRow team={data.home} slots={slots} which="home" totals={data.totals.home} currentInning={data.currentInning} />
        </tbody>
      </table>

      {data.scoringPlays && data.scoringPlays.length > 0 ? (
        <div className="border-t border-line-subtle p-3">
          <div className="label-micro mb-2">Scoring plays</div>
          <ul className="space-y-1.5">
            {data.scoringPlays.map((p, i) => (
              <li key={i} className="flex items-baseline gap-3 text-2xs">
                <span className="stat-num text-ink-faint shrink-0 w-12">
                  {p.halfInning === 'top' ? 'Top' : 'Bot'} {p.inning}
                  {ord(p.inning)}
                </span>
                <span className="flex-1 text-ink-muted">{p.description}</span>
                <span className="stat-num text-ink shrink-0">
                  {data.away.abbr} {p.awayScore}–{p.homeScore} {data.home.abbr}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="px-3 py-3 text-2xs text-ink-faint">No scoring plays yet.</div>
      )}
    </div>
  );
}

function ScoreRow({
  team,
  slots,
  which,
  totals,
  currentInning,
}: {
  team: { id: number; abbr: string; name: string };
  slots: { num: number; away?: number; home?: number }[];
  which: 'away' | 'home';
  totals: { runs: number; hits: number; errors: number };
  currentInning?: number | null;
}) {
  return (
    <tr className="border-b border-line-subtle last:border-0">
      <td className="px-3 py-2">
        <Link href={`/team/${team.id}`} className="flex items-center gap-2 hover:text-accent">
          <img src={teamCapLogoUrl(team.id)} alt="" className="w-5 h-5 team-logo opacity-95" />
          <span className="text-sm font-medium">{team.abbr}</span>
        </Link>
      </td>
      {slots.map((s) => {
        const r = which === 'away' ? s.away : s.home;
        const isCurrent = currentInning === s.num;
        const intensity = r !== undefined && r > 0 ? Math.min(0.6, r * 0.18) : 0;
        return (
          <td
            key={s.num}
            className="text-center stat-num"
            style={{ background: r !== undefined && r > 0 ? `rgba(250, 204, 21, ${intensity})` : isCurrent ? 'rgba(250, 204, 21, 0.06)' : undefined }}
          >
            {r === undefined
              ? <span className="text-ink-faint">-</span>
              : r > 0
              ? <span className="text-accent font-semibold">{r}</span>
              : <span className="text-ink-muted">{r}</span>}
          </td>
        );
      })}
      <td className="text-center stat-num text-base font-bold border-l border-line">{totals.runs}</td>
      <td className="text-center stat-num text-base font-semibold text-ink-muted">{totals.hits}</td>
      <td className="text-center stat-num text-base font-semibold text-ink-muted">{totals.errors}</td>
    </tr>
  );
}

function ord(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  const last = n % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}
