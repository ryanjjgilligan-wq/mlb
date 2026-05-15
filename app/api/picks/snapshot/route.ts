import { NextResponse } from 'next/server';
import { snapshotPicksForDate } from '@/lib/picks';
import { ymd } from '@/lib/time';
import { hasPersistence } from '@/lib/picksStore';

export const dynamic = 'force-dynamic';

/**
 * Snapshots today's picks (or a specified date) into the persistent log.
 *
 * GET /api/picks/snapshot?date=2026-05-15 — if date omitted, uses today
 *
 * Idempotent: re-running the same date returns the existing snapshot.
 *
 * Designed to be called by Vercel Cron daily (vercel.json configures this).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? ymd();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date format' }, { status: 400 });
  }

  const persisted = await hasPersistence();
  const snap = await snapshotPicksForDate(date);

  return NextResponse.json({
    date,
    pickCount: snap.picks.length,
    persistent: persisted,
    note: persisted
      ? undefined
      : 'KV not configured — snapshot was stored in process memory and will be lost on next cold start. Add Vercel KV to enable persistence.',
  });
}
