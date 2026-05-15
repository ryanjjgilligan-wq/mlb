import { NextResponse } from 'next/server';
import { searchPlayers, getTeams } from '@/lib/mlb';

export const revalidate = 600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q || q.length < 2) return NextResponse.json({ hits: [] });

  const [players, teams] = await Promise.all([
    searchPlayers(q).catch(() => []),
    getTeams().catch(() => []),
  ]);

  const ql = q.toLowerCase();
  const teamHits = teams
    .filter((t) => t.name.toLowerCase().includes(ql) || t.abbreviation?.toLowerCase().includes(ql))
    .slice(0, 4)
    .map((t) => ({ type: 'team' as const, id: t.id, name: t.name, meta: t.abbreviation }));

  const playerHits = players.slice(0, 8).map((p) => ({
    type: 'player' as const,
    id: p.id,
    name: p.fullName,
    meta: p.currentTeam?.name ? `${p.primaryPosition?.abbreviation ?? ''} · ${p.currentTeam.name}` : p.primaryPosition?.name,
  }));

  return NextResponse.json({ hits: [...teamHits, ...playerHits] });
}
