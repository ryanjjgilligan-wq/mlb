import Link from 'next/link';
import { teamCapLogoUrl } from '@/lib/mlb';

export type LastPlayCardData = {
  away: { id: number; abbr: string; runs: number };
  home: { id: number; abbr: string; runs: number };
  homeWP?: number; // 0–1
  description?: string;
  halfInning?: 'top' | 'bottom';
  inning?: number;
};

/**
 * "Win Probability — last play" card. Mirrors the broadcast/MLB.com graphic
 * showing the leading team's WP %, both teams' current scores, the inning,
 * and the most recent play description.
 */
export function LastPlayCard({ d }: { d: LastPlayCardData }) {
  const homeLeading = d.homeWP != null ? d.homeWP >= 0.5 : d.home.runs > d.away.runs;
  const leadingTeam = homeLeading ? d.home : d.away;
  const leadingPct = d.homeWP != null
    ? homeLeading ? d.homeWP : 1 - d.homeWP
    : null;

  return (
    <div className="border border-line rounded-md bg-bg-raised">
      {/* Header — leading team's WP */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line-subtle">
        <Link href={`/team/${leadingTeam.id}`} className="flex items-center gap-2 hover:text-accent">
          <img src={teamCapLogoUrl(leadingTeam.id)} alt="" className="w-5 h-5 team-logo opacity-95" />
          <span className="text-sm font-semibold">{leadingTeam.abbr}</span>
        </Link>
        {leadingPct != null && (
          <span className="stat-num text-xl font-semibold text-ink">
            {(leadingPct * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Score line */}
      <div className="px-4 py-2 flex items-center justify-between text-sm">
        <span className="text-ink-muted stat-num">
          {leadingPct != null ? `WP ${(leadingPct * 100).toFixed(1)}%` : 'Leading'}
        </span>
        <span className="text-ink stat-num font-semibold">
          {d.away.abbr} {d.away.runs} – {d.home.runs} {d.home.abbr}
        </span>
      </div>

      {/* Last play */}
      {(d.description || d.inning) && (
        <div className="px-4 py-2.5 border-t border-line-subtle">
          {d.inning && (
            <div className="label-micro mb-1">
              {d.halfInning === 'top' ? 'Top' : 'Bottom'} {d.inning}
              {ord(d.inning)}
            </div>
          )}
          {d.description && (
            <p className="text-sm text-ink-muted leading-snug">{d.description}</p>
          )}
        </div>
      )}
    </div>
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
