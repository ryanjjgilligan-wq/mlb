# DiamondIQ

A serious MLB analytics command center. Live stats, sabermetrics, and model-driven predictions
fused into a dense, dark-mode-first analyst dashboard.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS, dark mode default, tabular-figure typography
- Recharts for charts
- MLB Stats API as live data source (no key required)
- Vitest for sabermetric formula unit tests

## Run locally

```bash
pnpm install
pnpm dev
```

Visit http://localhost:3000.

## Test

```bash
pnpm test
```

Sabermetric formulas (wOBA, FIP, OBP, SLG, BABIP, Pythagorean, etc.) are unit-tested against
known historical seasons (Trout 2012, deGrom 2018, 2001 Mariners).

## What's in the box

- **League Command Center** — live scoreboard with 30s revalidation, Pythagorean over/under-performers, division standings strip
- **Standings** — full division tables with run-differential signal columns and Pyth expected W%
- **Teams** — all 30 active clubs, grouped by league + division
- **Team page** — identity, season hitting/pitching summary, rolling schedule, full active roster
- **Player dossier** — slash line, derived advanced rates (wOBA / ISO / BABIP / K% / BB% for hitters, FIP / WHIP / K/9 / BB/9 / HR/9 for pitchers), Savant-style percentile profile, year-by-year career
- **Game page** — live linescore, boxscore, pre-game projection (Log5 baseline), live win probability chart from MLB feed, probable / starting pitcher cards
- **Model Lab** — transparent ledger of every formula and model on the site, including known limitations and the roadmap for upgrades
- **⌘K search** — across players and teams

## Architectural honesty

Things the original brief specified that are **not yet shipped**:

- Python ML microservice (FastAPI + XGBoost + PyMC)
- pybaseball / Baseball Savant Statcast ingestion (xBA, xSLG, xwOBA, EV, LA, spray charts)
- Postgres + Drizzle persistence
- Redis caching (Vercel data cache used instead)
- Auth / watchlists / alerts
- Custom-trained game / run-total models (current model is a transparent Log5 baseline)

These all have clear upgrade paths documented inline in code and on the `/lab` page. The point of
this build is to ship the foundation rock-solid: correct stat calculations, honest UI, real data,
and zero hallucination — and to mark stub layers as stubs.

## Data freshness

| Resource | Revalidation |
|---|---|
| Live game feed | 15s |
| Schedule / scoreboard | 30s |
| Standings | 5m |
| Season stats | 10m |
| Rosters | 30m |
| Career stats | 24h |

## Sabermetric formulas

Every advanced metric cites its source in `lib/saber.ts`. Static linear weights are used for
wOBA (Fangraphs ~2023 blend) and a static 3.10 FIP constant — within ~0.1 of Fangraphs's
per-season-tuned figures. For exact match, ingest league context tables per season.

## Disclaimer

For informational and analytical use. Not betting advice.
