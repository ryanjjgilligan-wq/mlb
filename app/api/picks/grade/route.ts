import { NextResponse } from 'next/server';
import { gradePicksForDate, getAllPicksDates } from '@/lib/picks';
import { ymd, shiftYmd } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Grades all pending picks for a given date (or yesterday by default).
 *
 * GET /api/picks/grade?date=2026-05-15 — if date omitted, grades yesterday
 * GET /api/picks/grade?backfill=true   — grades every date in the log
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const backfill = url.searchParams.get('backfill') === 'true';
  const date = url.searchParams.get('date') ?? shiftYmd(ymd(), -1);

  if (backfill) {
    const dates = await getAllPicksDates();
    const results: any[] = [];
    for (const d of dates) {
      const snap = await gradePicksForDate(d).catch(() => null);
      if (snap) {
        const graded = snap.picks.filter((p) => p.result && p.result !== 'pending').length;
        results.push({ date: d, total: snap.picks.length, graded });
      }
    }
    return NextResponse.json({ backfilled: results.length, results });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date format' }, { status: 400 });
  }

  const snap = await gradePicksForDate(date);
  if (!snap) {
    return NextResponse.json({ date, error: 'no picks found for date' }, { status: 404 });
  }

  const graded = snap.picks.filter((p) => p.result && p.result !== 'pending').length;
  const wins = snap.picks.filter((p) => p.result === 'win').length;
  const losses = snap.picks.filter((p) => p.result === 'loss').length;

  return NextResponse.json({
    date,
    total: snap.picks.length,
    graded,
    wins,
    losses,
    hitRate: graded > 0 ? wins / (wins + losses) : 0,
  });
}
