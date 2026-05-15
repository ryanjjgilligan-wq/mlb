import Link from 'next/link';
import { getSchedule, getStandings, getTeams, getTransactions } from '@/lib/mlb';
import { buildSlateInsights } from '@/lib/insights';
import { Sparkles, Trophy } from 'lucide-react';
import { getPicksForDate, aggregate } from '@/lib/picks';
import { GameRow } from '@/components/GameRow';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { Stat } from '@/components/ui/Stat';
import { ymd, shiftYmd } from '@/lib/time';
import { fmtAvg, fmtSigned, pythagorean } from '@/lib/saber';
import { ChevronRight } from 'lucide-react';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LocalDate } from '@/components/LocalDate';

export const revalidate = 30;

export default async function HomePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const today = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : ymd();
  const yesterday = shiftYmd(today, -1);
  const [scheduleToday, standings, transactions, insights, yRecap] = await Promise.all([
    getSchedule(today).catch(() => []),
    getStandings().catch(() => []),
    getTransactions(5).catch(() => []),
    buildSlateInsights(today).catch(() => ({ opportunities: [], games: [], date: today })),
    getPicksForDate(yesterday).catch(() => null),
  ]);
  const yAgg = yRecap ? aggregate(yRecap.picks) : null;

  const games = scheduleToday[0]?.games ?? [];
  const live = games.filter((g) => g.status.abstractGameState === 'Live');
  const upcoming = games.filter((g) => g.status.abstractGameState === 'Preview');
  const final = games.filter((g) => g.status.abstractGameState === 'Final');

  // Quick league-wide pulse
  const allTeams = standings.flatMap((d) => d.teamRecords);
  const sortedByPyth = [...allTeams]
    .map((t) => ({
      ...t,
      pyth: pythagorean(t.runsScored ?? 0, t.runsAllowed ?? 0),
      actualPct: parseFloat(t.winningPercentage) || 0,
    }))
    .filter((t) => (t.runsScored ?? 0) > 0);

  const overPerformers = [...sortedByPyth]
    .sort((a, b) => a.pyth - a.actualPct - (b.pyth - b.actualPct))
    .slice(0, 5);
  const underPerformers = [...sortedByPyth]
    .sort((a, b) => b.pyth - b.actualPct - (a.pyth - a.actualPct))
    .slice(0, 5);

  const totalRuns = allTeams.reduce((s, t) => s + (t.runsScored ?? 0), 0);
  const totalGames = allTeams.reduce((s, t) => s + t.wins + t.losses, 0);
  const leagueRPG = totalGames ? (totalRuns * 2) / totalGames : 0;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Header band */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">League Command Center</h1>
          <p className="text-sm text-ink-muted mt-1">
            <LocalDate ymd={today} className="stat-num" />
            <span className="px-2 text-ink-faint">·</span>
            {games.length} game{games.length === 1 ? '' : 's'} on the slate
            {live.length > 0 && (
              <>
                <span className="px-2 text-ink-faint">·</span>
                <Badge variant="neg" pulse>{live.length} live</Badge>
              </>
            )}
            {games.length > 0 && today === ymd() && (
              <>
                <span className="px-2 text-ink-faint">·</span>
                <AutoRefresh
                  intervalMs={live.length > 0 ? 30_000 : 120_000}
                  label={live.length > 0 ? 'auto-refresh 30s' : 'auto-refresh 2m'}
                />
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-6">
          {yAgg && yAgg.total > 0 && (
            <Link href={`/recap/${yesterday}`} className="flex flex-col items-end gap-0.5 hover:bg-bg-hover rounded px-2 py-1 transition-colors">
              <span className="label-micro flex items-center gap-1"><Trophy size={10} className="text-accent" /> Yesterday's recap</span>
              <span className={`stat-num text-sm font-semibold ${
                yAgg.units > 0 ? 'text-signal-pos' : yAgg.units < 0 ? 'text-signal-neg' : 'text-ink'
              }`}>
                {yAgg.wins}-{yAgg.losses} · {yAgg.units >= 0 ? '+' : ''}{yAgg.units.toFixed(1)}u
              </span>
            </Link>
          )}
          <Stat
            label="League AVG R/G"
            value={leagueRPG.toFixed(2)}
            size="sm"
            hint="Combined runs scored across both clubs per game played league-wide this season."
          />
          <Stat label="Teams" value={allTeams.length} size="sm" />
        </div>
      </div>

      {/* Pick of the Day — curated top opportunities */}
      {insights.opportunities.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent" />
              Picks of the Day
            </span>
          }
          subtitle={`Top ${Math.min(3, insights.opportunities.length)} highest-confidence model edges across today's slate`}
          actions={
            <Link href="/opportunities" className="text-2xs text-ink-muted hover:text-ink uppercase tracking-micro">
              all opportunities →
            </Link>
          }
          flush
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line">
            {insights.opportunities.slice(0, 3).map((o, i) => (
              <Link
                key={`${o.category}-${o.gamePk}-${i}`}
                href={`/game/${o.gamePk}`}
                className="bg-bg-panel hover:bg-bg-hover transition-colors p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={
                    o.category === 'shootout' || o.category === 'total-high' ? 'pos' :
                    o.category === 'total-low' || o.category === 'weather' ? 'info' :
                    o.category === 'k-matchup' ? 'accent' :
                    o.category === 'mismatch' ? 'warn' : 'neutral'
                  }>{o.metric}</Badge>
                  <span className={`text-2xs uppercase tracking-micro ${
                    o.confidence === 'high' ? 'text-signal-pos' : 'text-signal-info'
                  }`}>{o.confidence} · {o.confidenceScore}</span>
                </div>
                <h3 className="text-sm font-semibold text-ink leading-snug">{o.headline}</h3>
                <p className="text-2xs text-ink-faint">{o.subline}</p>
                <p className="text-2xs text-ink-muted mt-1 line-clamp-3">{o.explanation}</p>
                <div className="mt-auto pt-2 flex items-center justify-between text-2xs text-ink-faint">
                  <span className="stat-num">{o.gameLabel}</span>
                  <span>open game →</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Today's slate */}
        <Panel
          className="lg:col-span-7"
          title="Today's slate"
          subtitle="Scores update every 30s · click a game for win probability and matchups"
          actions={
            <DateNav today={today} />
          }
          flush
        >
          {games.length === 0 ? (
            <Empty
              title="No games scheduled."
              description="Off-day. Check the standings panel or pick a date above."
            />
          ) : (
            <div className="divide-y divide-line">
              {live.length > 0 && (
                <Section label="Live" count={live.length}>
                  {live.map((g) => <GameRow key={g.gamePk} game={g} />)}
                </Section>
              )}
              {upcoming.length > 0 && (
                <Section label="Upcoming" count={upcoming.length}>
                  {upcoming.map((g) => <GameRow key={g.gamePk} game={g} />)}
                </Section>
              )}
              {final.length > 0 && (
                <Section label="Final" count={final.length}>
                  {final.map((g) => <GameRow key={g.gamePk} game={g} />)}
                </Section>
              )}
            </div>
          )}
        </Panel>

        {/* Movers panel — Pythagorean over/under-performers */}
        <div className="lg:col-span-5 space-y-4">
          <Panel
            title="Outperforming Pythagoras"
            subtitle="Wins above what run differential predicts — regression candidates"
          >
            <MoversTable rows={overPerformers} variant="pos" />
          </Panel>
          <Panel
            title="Underperforming Pythagoras"
            subtitle="Wins below run-differential expectation — bounce-back candidates"
          >
            <MoversTable rows={underPerformers} variant="neg" />
          </Panel>
        </div>
      </div>

      {/* Wire — recent transactions */}
      <Panel
        title="Wire"
        subtitle={`Roster moves from the last 5 days · ${transactions.length} transactions`}
        actions={
          <span className="text-2xs text-ink-faint">MLB Stats API · /transactions</span>
        }
        flush
      >
        {transactions.length === 0 ? (
          <Empty title="No recent transactions." />
        ) : (
          <ul className="divide-y divide-line-subtle max-h-80 overflow-y-auto">
            {transactions.slice(0, 50).map((tx: any) => (
              <li key={tx.id ?? `${tx.date}-${tx.person?.id}-${tx.typeCode}`}>
                <div className="flex items-center gap-3 px-3 py-1.5 row-hover">
                  <span className="text-2xs text-ink-faint stat-num w-12">{(tx.date ?? '').slice(5, 10)}</span>
                  <Badge variant={txVariant(tx.typeCode)}>{tx.typeCode ?? '—'}</Badge>
                  <span className="text-sm flex-1 truncate">
                    {tx.description ?? `${tx.person?.fullName ?? '—'} · ${tx.toTeam?.name ?? ''}`}
                  </span>
                  {tx.toTeam?.id && (
                    <Link href={`/team/${tx.toTeam.id}`} className="text-2xs text-ink-faint hover:text-ink truncate max-w-[120px]">
                      {tx.toTeam.abbreviation ?? tx.toTeam.name}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Standings strip */}
      <Panel
        title="Standings snapshot"
        subtitle="Division leaders, run differential, expected W% (Pythagorean, 1.83 exp)"
        actions={
          <Link href="/standings" className="text-2xs text-ink-muted hover:text-ink flex items-center gap-1">
            Full standings <ChevronRight size={12} />
          </Link>
        }
        flush
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
          {standings.map((div) => (
            <div key={div.division.id} className="bg-bg-panel p-3">
              <div className="label-micro mb-2">{div.division.name}</div>
              <div className="space-y-1">
                {div.teamRecords.slice(0, 5).map((tr, i) => {
                  const pyth = pythagorean(tr.runsScored ?? 0, tr.runsAllowed ?? 0);
                  const actual = parseFloat(tr.winningPercentage) || 0;
                  const diff = actual - pyth;
                  return (
                    <Link
                      key={tr.team.id}
                      href={`/team/${tr.team.id}`}
                      className="flex items-center gap-2 px-2 py-1 -mx-2 rounded row-hover"
                    >
                      <span className="text-2xs text-ink-faint stat-num w-3">{i + 1}</span>
                      <span className="text-sm flex-1 truncate">{tr.team.name}</span>
                      <span className="text-2xs stat-num text-ink-muted w-14 text-right">{tr.wins}-{tr.losses}</span>
                      <span
                        className={`text-2xs stat-num w-12 text-right ${diff > 0.02 ? 'text-signal-pos' : diff < -0.02 ? 'text-signal-neg' : 'text-ink-faint'}`}
                      >
                        {fmtSigned(diff * 100, 1)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function txVariant(code: string | undefined): 'pos' | 'neg' | 'warn' | 'info' | 'neutral' {
  if (!code) return 'neutral';
  if (/^SU|RC|CU$/.test(code)) return 'pos';     // Selected, recalled, contract purchased
  if (/^DFA|REL|RT$/.test(code)) return 'neg';   // Designated, released, returned
  if (/^DES|OUT|TR$/.test(code)) return 'warn';  // Designated, optioned, traded
  if (/^SC|CL$/.test(code)) return 'info';       // Status changed, claimed
  return 'neutral';
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
        <span className="label-micro">{label}</span>
        <span className="text-2xs text-ink-faint stat-num">{count}</span>
      </div>
      <div className="space-y-px pb-1">{children}</div>
    </div>
  );
}

function MoversTable({
  rows,
  variant,
}: {
  rows: Array<any>;
  variant: 'pos' | 'neg';
}) {
  if (!rows.length) {
    return <Empty title="Not enough data yet" description="Run differential needed." />;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-2xs uppercase tracking-micro text-ink-muted">
          <th className="text-left font-medium pb-1.5">Team</th>
          <th className="text-right font-medium pb-1.5">W-L</th>
          <th className="text-right font-medium pb-1.5">Exp W%</th>
          <th className="text-right font-medium pb-1.5">Δ</th>
        </tr>
      </thead>
      <tbody className="text-sm">
        {rows.map((t) => {
          const diff = t.actualPct - t.pyth;
          return (
            <tr key={t.team.id} className="row-hover">
              <td className="py-1">
                <Link href={`/team/${t.team.id}`} className="hover:text-accent">
                  {t.team.name}
                </Link>
              </td>
              <td className="text-right stat-num text-ink-muted">{t.wins}-{t.losses}</td>
              <td className="text-right stat-num text-ink-muted">{fmtAvg(t.pyth)}</td>
              <td className={`text-right stat-num ${variant === 'pos' ? 'text-signal-neg' : 'text-signal-pos'}`}>
                {fmtSigned(diff * 100, 1)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DateNav({ today }: { today: string }) {
  const yesterday = shiftYmd(today, -1);
  const tomorrow = shiftYmd(today, 1);
  return (
    <div className="flex items-center gap-1 text-2xs">
      <Link href={`/?date=${yesterday}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">‹</Link>
      <span className="text-ink-muted px-1 stat-num">{today === ymd() ? 'TODAY' : today}</span>
      <Link href={`/?date=${tomorrow}`} className="px-1.5 py-0.5 rounded hover:bg-bg-hover text-ink-muted">›</Link>
    </div>
  );
}
