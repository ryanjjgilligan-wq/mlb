import { NextResponse } from 'next/server';
import { getSchedule } from '@/lib/mlb';
import { ymd } from '@/lib/time';

export const revalidate = 30;

export async function GET() {
  const schedule = await getSchedule(ymd()).catch(() => []);
  const games = schedule[0]?.games ?? [];
  const live = games.filter((g) => g.status.abstractGameState === 'Live').length;
  return NextResponse.json({ live });
}
