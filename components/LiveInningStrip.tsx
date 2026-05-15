/**
 * Compact inning-by-inning runs strip that auto-highlights the current
 * inning. Cell shade scales with runs: 0=neutral, 1-2=mild green, 3+=hot.
 */
export type InningStripData = {
  innings: Array<{ num: number; away?: { runs?: number }; home?: { runs?: number } }>;
  awayName: string;
  homeName: string;
  currentInning?: number | null;
};

export function LiveInningStrip({ innings, awayName, homeName, currentInning }: InningStripData) {
  // Always show at least 9 innings
  const total = Math.max(9, innings.length);
  const inningSlots = Array.from({ length: total }, (_, i) => {
    const inn = innings.find((x) => x.num === i + 1);
    return { num: i + 1, away: inn?.away?.runs, home: inn?.home?.runs };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
            <th className="text-left font-medium px-3 py-2">Team</th>
            {inningSlots.map((s) => (
              <th
                key={s.num}
                className={`text-center font-medium px-1 py-2 w-7 stat-num ${currentInning === s.num ? 'text-accent' : ''}`}
              >
                {s.num}
              </th>
            ))}
            <th className="text-center font-medium px-3 py-2 w-10">R</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line-subtle">
            <td className="px-3 py-1.5 text-sm">{awayName}</td>
            {inningSlots.map((s) => (
              <RunCell key={s.num} runs={s.away} current={currentInning === s.num} />
            ))}
            <td className="text-center stat-num font-semibold px-3">
              {inningSlots.reduce((s, i) => s + (i.away ?? 0), 0)}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-1.5 text-sm">{homeName}</td>
            {inningSlots.map((s) => (
              <RunCell key={s.num} runs={s.home} current={currentInning === s.num} />
            ))}
            <td className="text-center stat-num font-semibold px-3">
              {inningSlots.reduce((s, i) => s + (i.home ?? 0), 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RunCell({ runs, current }: { runs?: number; current?: boolean }) {
  if (runs === undefined) {
    return (
      <td className={`text-center stat-num text-ink-faint ${current ? 'bg-accent/5' : ''}`}>·</td>
    );
  }
  // Heat shading: 0 neutral, 1-2 mild, 3+ hot
  const intensity = Math.min(0.6, runs * 0.18);
  const bg = runs > 0 ? `rgba(250, 204, 21, ${intensity})` : undefined;
  return (
    <td
      className="text-center stat-num"
      style={{ background: bg }}
    >
      {runs > 0 ? <span className="text-accent font-semibold">{runs}</span> : <span className="text-ink-muted">{runs}</span>}
    </td>
  );
}
