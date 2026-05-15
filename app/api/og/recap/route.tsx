import { ImageResponse } from 'next/og';
import { getPicksForDate, aggregate } from '@/lib/picks';
import { ymd, shiftYmd } from '@/lib/time';

export const runtime = 'edge';

/**
 * Generates a 1200x630 OG image for a daily recap. Drop the URL into a tweet
 * and Twitter/X will render the image card automatically.
 *
 * Usage: /api/og/recap?date=2026-05-15
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? shiftYmd(ymd(), -1);

  const snap = await getPicksForDate(date);
  const agg = snap ? aggregate(snap.picks) : { total: 0, wins: 0, losses: 0, pushes: 0, pending: 0, hitRate: 0, units: 0 };
  const wins = snap?.picks.filter((p) => p.result === 'win').sort((a, b) => b.confidence - a.confidence) ?? [];
  const losses = snap?.picks.filter((p) => p.result === 'loss').sort((a, b) => a.confidence - b.confidence) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0b',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: 60,
          fontFamily: 'system-ui, -apple-system',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 32, height: 32, transform: 'rotate(45deg)', background: '#facc15', borderRadius: 4,
            }} />
            <div style={{ fontSize: 32, fontWeight: 600, color: '#e8e8ec', letterSpacing: -0.5 }}>DiamondIQ</div>
          </div>
          <div style={{ fontSize: 22, color: '#9a9aa3', fontFamily: 'monospace' }}>{date}</div>
        </div>

        {/* Title */}
        <div style={{ marginTop: 30, fontSize: 56, fontWeight: 700, color: '#e8e8ec', letterSpacing: -1 }}>
          Daily recap
        </div>

        {/* Big numbers row */}
        <div style={{
          marginTop: 36,
          display: 'flex',
          gap: 0,
          background: '#1f1f24',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <Cell label="PICKS" value={agg.total.toString()} />
          <Cell label="RECORD" value={`${agg.wins}-${agg.losses}`} accent={agg.wins > agg.losses ? 'pos' : agg.losses > agg.wins ? 'neg' : undefined} />
          <Cell label="HIT %" value={agg.total > 0 ? `${(agg.hitRate * 100).toFixed(1)}%` : '—'} accent={agg.hitRate > 0.55 ? 'pos' : agg.hitRate < 0.45 && agg.total > 0 ? 'neg' : undefined} />
          <Cell label="UNITS" value={agg.units >= 0 ? `+${agg.units.toFixed(1)}` : agg.units.toFixed(1)} accent={agg.units > 0 ? 'pos' : agg.units < 0 ? 'neg' : undefined} />
        </div>

        {/* Best call */}
        {wins[0] && (
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 18, color: '#34d399', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>Best call</div>
            <div style={{ fontSize: 28, color: '#e8e8ec', marginTop: 6 }}>
              {wins[0].gameLabel} · {wins[0].side}{wins[0].line != null ? ` ${wins[0].line}` : ''} → {wins[0].actual ?? ''}
            </div>
          </div>
        )}

        {/* Spacer + footer */}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #1f1f24', paddingTop: 18 }}>
          <div style={{ fontSize: 18, color: '#9a9aa3' }}>
            Public track record · diamondiq.com/track-record
          </div>
          <div style={{ fontSize: 14, color: '#62626b' }}>For analytical use only · not betting advice</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: 'pos' | 'neg' }) {
  const color = accent === 'pos' ? '#34d399' : accent === 'neg' ? '#f87171' : '#e8e8ec';
  return (
    <div style={{
      flex: 1,
      background: '#0f0f12',
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #1f1f24',
    }}>
      <div style={{ fontSize: 14, color: '#9a9aa3', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 56, fontWeight: 700, color, marginTop: 6, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}
