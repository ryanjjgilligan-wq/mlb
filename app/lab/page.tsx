import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';

export const metadata = { title: 'Model Lab' };

export default function LabPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Model Lab</h1>
        <p className="text-sm text-ink-muted mt-1 max-w-2xl">
          A transparent ledger of every metric and model on the site: what's in the formula, what
          we assume, where the limits are. If a number is on this site, it should be defensible
          here.
        </p>
      </header>

      <Panel title="Sabermetrics" subtitle="Counting-stat-derived rate stats">
        <Section
          name="wOBA — Weighted On-Base Average"
          status="approx"
          formula="(0.696·uBB + 0.728·HBP + 0.883·1B + 1.244·2B + 1.569·3B + 2.004·HR) / (AB + BB − IBB + SF + HBP)"
          source="Tom Tango, The Book. Weights from Fangraphs Guts! table (~2023–2024 season blend)."
          notes={[
            'Real wOBA recomputes weights yearly; our static weights drift slightly from the published figure.',
            'No park adjustment, no league-context normalization (i.e. no wRC+ until we ingest league totals).',
          ]}
        />
        <Section
          name="FIP — Fielding Independent Pitching"
          status="approx"
          formula="((13·HR + 3·(BB+HBP) − 2·K) / IP) + 3.10"
          source="Tom Tango. The 3.10 constant is a multi-year blend; Fangraphs uses a per-season constant tuned to league ERA."
          notes={[
            'Result will be within ~0.1 of Fangraphs published FIP for current seasons.',
            'Verified against deGrom 2018 (Cy Young): we produce ~1.93 vs. published 1.99.',
          ]}
        />
        <Section
          name="Pythagorean Expected W%"
          status="solid"
          formula="RS^1.83 / (RS^1.83 + RA^1.83)"
          source="Bill James. Exponent 1.83 is a stable approximation; Pythagenpat dynamically chooses exponent."
          notes={['Used to identify clubs over/under-performing run differential — common regression signal.']}
        />
        <Section
          name="OBP / SLG / ISO / BABIP / K% / BB%"
          status="solid"
          formula="Standard rulebook formulas"
          source="MLB rulebook + McCracken on BABIP"
          notes={['Unit tested against multiple known-reference player seasons.']}
        />
      </Panel>

      <Panel title="Predictive models" subtitle="Win probability and beyond">
        <Section
          name="Pre-game home win probability"
          status="baseline"
          formula="Log5(Pyth_home, Pyth_away) ⊗ home-field odds ratio (HFA = 0.54)"
          source="Bill James Log5; HFA baseline from multi-decade MLB averages."
          notes={[
            'Inputs: Pythagorean expected W% for each club from current-season run differential.',
            'Limitations: ignores starting pitcher quality, bullpen state, weather, umpire, lineup turnover.',
            'Upgrade path: logistic regression on rolling team wRC+, FIP, bullpen fatigue, park, weather, ump. Then XGBoost. Then calibrated isotonic regression.',
          ]}
        />
        <Section
          name="Live in-game win probability"
          status="external"
          formula="Sourced directly from MLB Stats API /game/{pk}/winProbability"
          source="MLB / Sportradar — recomputed each pitch."
          notes={['We display, we do not compute. Treat as ground truth for live games.']}
        />
        <Section
          name="Playoff probability — Monte Carlo"
          status="baseline"
          formula="N=5,000 sims of focal team's remaining schedule. Each game: Log5(home.pyth, away.pyth) with HFA odds-ratio adjustment. Playoff cut = current 6th-best W% in same league × total games."
          source="Standard sim approach; talent estimator is current-season Pythagorean."
          notes={[
            'Deterministic per-team via seeded mulberry32 RNG — repeat renders give the same answer.',
            'Limitation: opponent records held fixed (we don\'t simulate every league game). Real Baseball-Reference style sim needs full league remaining schedule.',
            'Inherits early-season noise from Pythagorean talent input.',
          ]}
        />
        <Section
          name="Leverage / high-impact play timeline"
          status="solid"
          formula="WPA(play_i) = homeWP(i) − homeWP(i−1) for each play in the MLB win-probability series; top 12 by |WPA|."
          source="Derived from MLB Stats API /winProbability endpoint."
          notes={['Pure derivation, no model — these are the actual swings the official feed computed.']}
        />
        <Section
          name="Comparables (k-NN)"
          status="baseline"
          formula="Euclidean distance on z-scored rate stats: hitters → (AVG, OBP, SLG, HR/AB, K%, BB%, SB/G); pitchers → (ERA, WHIP, K/9, BB/9, HR/9, OAvg). Similarity = 1/(1+distance)."
          source="Standard NN approach, computed at request time over qualified player pool."
          notes={[
            'Corpus = current season qualified hitters or pitchers (up to 200).',
            'No park / age / role adjustments — players from different roles may match by raw shape.',
          ]}
        />
        <Section
          name="Lineup-vs-pitcher matchup matrix"
          status="solid"
          formula="Each batter's season split vs the opposing starter's pitching hand (vL or vR), pulled from MLB statSplits endpoint."
          source="MLB Stats API."
          notes={['Empty rows = no qualifying PA vs that hand yet this season. No projection model on top yet.']}
        />
        <Section
          name="Run total prediction"
          status="todo"
          formula="Planned: Poisson / Negative Binomial regression on team RS/G, opp RA/G, starter FIP, park, weather"
          source="Standard sports-modeling approach"
          notes={['Not yet shipped. Needs offline training pipeline.']}
        />
        <Section
          name="Player game-line props"
          status="todo"
          formula="Planned: Gamma/Poisson hybrid by event type (hits, TB, K)"
          source="—"
          notes={['Not yet shipped.']}
        />
      </Panel>

      <Panel title="Data freshness" subtitle="Server cache windows + client auto-refresh">
        <p className="text-2xs text-ink-muted mb-3">
          Two layers. <span className="text-ink">Server cache</span> (Vercel Data Cache,
          shared across all visitors) decides how stale a fetch can be before it triggers
          a fresh pull from MLB. <span className="text-ink">Client auto-refresh</span>
          (router.refresh on a timer, paused when the tab is hidden) decides how often
          your open browser tab re-renders so you see the new data without a manual
          reload. Both are at-most-stale guarantees — not push.
        </p>
        <div className="text-2xs text-ink-muted">
          <table className="w-full">
            <thead>
              <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                <th className="text-left font-medium pb-2">Resource</th>
                <th className="text-left font-medium pb-2">Revalidation</th>
                <th className="text-left font-medium pb-2">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Live game feed', '15s', 'Pitch-by-pitch deltas'],
                ['Schedule / scoreboard', '30s', 'Score updates'],
                ['Standings', '5m', 'Slow-changing'],
                ['Season stats', '10m', 'Game-end recomputes'],
                ['Rosters', '30m', 'Transactions infrequent'],
                ['Player bios', '30m', 'Effectively static'],
                ['Year-by-year career stats', '24h', 'Historical, immutable'],
                ['Teams catalog', '1h', 'Effectively static'],
              ].map(([k, v, why]) => (
                <tr key={k} className="border-b border-line-subtle last:border-0">
                  <td className="py-1.5 text-ink">{k}</td>
                  <td className="py-1.5 stat-num">{v}</td>
                  <td className="py-1.5 text-ink-muted">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-2xs text-ink-muted">
          <div className="label-micro mb-2">Client auto-refresh cadence</div>
          <table className="w-full">
            <thead>
              <tr className="text-2xs uppercase tracking-micro text-ink-muted border-b border-line">
                <th className="text-left font-medium pb-2">Page</th>
                <th className="text-left font-medium pb-2">Cadence</th>
                <th className="text-left font-medium pb-2">When</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line-subtle">
                <td className="py-1.5 text-ink">League Command Center</td>
                <td className="py-1.5 stat-num">30s</td>
                <td className="py-1.5">Any live game today</td>
              </tr>
              <tr className="border-b border-line-subtle">
                <td className="py-1.5 text-ink">League Command Center</td>
                <td className="py-1.5 stat-num">2m</td>
                <td className="py-1.5">Today has games but none live</td>
              </tr>
              <tr className="border-b border-line-subtle">
                <td className="py-1.5 text-ink">Game page (live)</td>
                <td className="py-1.5 stat-num">15s</td>
                <td className="py-1.5">Game is in progress</td>
              </tr>
              <tr className="border-b border-line-subtle">
                <td className="py-1.5 text-ink">Game page (preview)</td>
                <td className="py-1.5 stat-num">5m</td>
                <td className="py-1.5">Catches lineup announcements + first-pitch flip</td>
              </tr>
              <tr className="border-b border-line-subtle last:border-0">
                <td className="py-1.5 text-ink">Everything else</td>
                <td className="py-1.5 stat-num">none</td>
                <td className="py-1.5">Loads fresh on each navigation</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3">
            Auto-refresh pauses when the tab is hidden (no quota burn on
            background tabs) and immediately refreshes once on tab focus.
            Each indicator can be clicked to pause/resume.
          </p>
        </div>
      </Panel>

      <Panel title="What's now shipped (vs original spec)" subtitle="Tracking against the deliverables list">
        <ul className="text-sm space-y-1.5 text-ink list-disc pl-5">
          <li>Live scoreboard, standings with Pyth Δ, team & player dossiers</li>
          <li>Rolling performance charts (15/30/60-game windows with regression bands)</li>
          <li>Splits panel (vs LHP/RHP, home/away, day/night)</li>
          <li>Comparables engine (k-NN over rate-stat z-scores)</li>
          <li>Monte Carlo playoff odds (5k sims per team)</li>
          <li>Lineup-vs-starter platoon matchup matrix</li>
          <li>Live win probability + leverage/high-impact play timeline</li>
          <li>Watchlist via browser localStorage</li>
          <li>Injury list per team</li>
          <li>⌘K command palette search across all players & teams</li>
        </ul>
      </Panel>

      <Panel title="What's intentionally missing (yet)" subtitle="Honest roadmap">
        <ul className="text-sm space-y-2 text-ink-muted list-disc pl-5">
          <li>
            <span className="text-ink">Statcast (xBA, xSLG, xwOBA, barrel rate, EV, LA).</span> Requires
            pybaseball ingestion job; not bundled because it needs a Python worker + storage.
          </li>
          <li>
            <span className="text-ink">Spray charts and pitch tunneling.</span> Pending Statcast pipeline.
          </li>
          <li>
            <span className="text-ink">Hot/cold zones.</span> Pending Statcast play-by-play.
          </li>
          <li>
            <span className="text-ink">League-context-adjusted stats (wRC+, OPS+, ERA−).</span> Need a
            per-season league totals table.
          </li>
          <li>
            <span className="text-ink">Lineup optimizer (Markov chain).</span> Tractable in JS; needs
            transition-probability calibration from PBP data.
          </li>
          <li>
            <span className="text-ink">Cross-device watchlist sync, alerts.</span> Need auth +
            persistence + a push channel.
          </li>
          <li>
            <span className="text-ink">Vegas line edges.</span> Need a paid odds API.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function Section({
  name,
  status,
  formula,
  source,
  notes,
}: {
  name: string;
  status: 'solid' | 'approx' | 'baseline' | 'external' | 'todo';
  formula: string;
  source: string;
  notes: string[];
}) {
  const variant =
    status === 'solid' ? 'pos' : status === 'approx' ? 'warn' : status === 'baseline' ? 'info' : status === 'external' ? 'neutral' : 'neg';
  return (
    <div className="border-t border-line-subtle first:border-0 py-4 first:pt-0">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h3 className="text-sm font-medium">{name}</h3>
        <Badge variant={variant}>{status}</Badge>
      </div>
      <div className="font-mono text-2xs bg-bg-sunken border border-line rounded p-2.5 mb-2 text-ink overflow-x-auto whitespace-pre">{formula}</div>
      <p className="text-2xs text-ink-muted mb-2">
        <span className="text-ink-faint">Source.</span> {source}
      </p>
      <ul className="text-2xs text-ink-muted space-y-1 list-disc pl-5">
        {notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </div>
  );
}
