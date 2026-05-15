import Link from 'next/link';
import { getTeams, teamCapLogoUrl, type Team } from '@/lib/mlb';
import { Panel } from '@/components/ui/Panel';

export const revalidate = 3600;
export const metadata = { title: 'Teams' };

export default async function TeamsPage() {
  const teams = await getTeams().catch(() => []);

  const byLeagueDivision: Record<string, Team[]> = {};
  for (const t of teams) {
    const key = `${t.league?.name ?? 'Unknown'} · ${t.division?.name ?? ''}`;
    (byLeagueDivision[key] ??= []).push(t);
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <p className="text-sm text-ink-muted mt-1">All 30 active MLB clubs · click for the team dossier.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(byLeagueDivision).sort().map(([key, group]) => (
          <Panel key={key} title={key} flush>
            <div className="divide-y divide-line-subtle">
              {[...group].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                <Link
                  key={t.id}
                  href={`/team/${t.id}`}
                  className="flex items-center gap-3 px-3 py-2 row-hover transition-colors"
                >
                  <img src={teamCapLogoUrl(t.id)} alt="" className="w-6 h-6 team-logo opacity-90" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-2xs text-ink-faint truncate">{t.venue?.name}</div>
                  </div>
                  <span className="text-2xs stat-num text-ink-muted">{t.abbreviation}</span>
                </Link>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
