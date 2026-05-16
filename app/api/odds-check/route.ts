/**
 * Diagnostic endpoint — confirms whether ODDS_API_KEY is reaching the runtime
 * and whether a live fetch to The Odds API actually succeeds. Returns NO key
 * material, only metadata (length, prefix, suffix) and HTTP status.
 *
 * Hit at /api/odds-check
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const key = process.env.ODDS_API_KEY;
  const present = typeof key === 'string' && key.length > 0;

  let fetchResult: {
    attempted: boolean;
    status?: number;
    ok?: boolean;
    eventCount?: number;
    requestsRemaining?: string | null;
    error?: string;
  } = { attempted: false };

  if (present) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${key}`;
      const res = await fetch(url, { cache: 'no-store' });
      const remaining = res.headers.get('x-requests-remaining');
      let eventCount = 0;
      try {
        const body = await res.json();
        if (Array.isArray(body)) eventCount = body.length;
      } catch {
        // ignore body parse error
      }
      fetchResult = {
        attempted: true,
        status: res.status,
        ok: res.ok,
        eventCount,
        requestsRemaining: remaining,
      };
    } catch (e: any) {
      fetchResult = { attempted: true, error: String(e?.message ?? e) };
    }
  }

  return Response.json({
    envVarPresent: present,
    envVarLength: present ? key!.length : 0,
    envVarPrefix: present ? key!.slice(0, 3) : null,
    envVarSuffix: present ? key!.slice(-3) : null,
    fetchResult,
    timestamp: new Date().toISOString(),
  });
}
