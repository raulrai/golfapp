# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16 caveat (from AGENTS.md):** this repo runs Next.js 16, which has breaking
> changes vs. older training data. Before writing framework code, read the relevant guide
> under `node_modules/next/dist/docs/` (e.g. `01-app` for App Router). Heed deprecation notices.

## Commands

```bash
npm run dev          # next dev (localhost:3000)
npm run build        # next build
npm run lint         # eslint (flat config, eslint.config.mjs)
node tests/golf.test.ts   # run the golf-engine test suite (Node 26 strips TS types natively)
```

There is no test runner/framework. `tests/golf.test.ts` is a plain Node script that prints
`✓/✗` lines and a pass/fail count, and sets a non-zero exit code on failure. It exercises the
pure modules under `src/lib/golf/`. To test one area, comment out the other `ok(...)` blocks or
copy the relevant calls into a scratch script. Requires Node ≥ 26.

The `scripts/*.mjs` files are one-off DB maintenance/migration/inspection tools run directly
with `node`. They load `DATABASE_URL` by hand-parsing `.env.local` (not `dotenv`) and connect
with `postgres` directly — they do **not** go through `src/lib/db.ts`. Read a script before
running it; several (`cleanup.mjs`, `del-round.mjs`) delete rows.

## Architecture

A mobile-first golf scoring + betting tracker for a ~20-player group at Delhi Golf Club
(Lodhi course). Next.js 16 App Router + React 19, Tailwind v4, TypeScript. Data lives in a
Supabase Postgres DB, accessed via the `postgres` (porsager) client — **no ORM, no Supabase
JS SDK**; routes write raw tagged-template SQL.

### Two-layer data model

The app has a deliberate split between a **live in-progress round** and **persisted history**:

- **Live round = client state in `localStorage`** (key `golf_active_game`), shaped by the
  `Game` interface in `src/lib/golf/game.ts`. The entire Play flow (setup → hole-by-hole
  scoring → live match/Auto Press readouts) runs client-side off this object. `loadGame` /
  `saveGame` persist it; nothing touches the DB until the round is saved.
- **Persisted round = Postgres.** Saving posts the `Game` to `POST /api/play-rounds`, which
  writes `rounds` + `round_players` + `scores` (+ `hole_scores` for hole-by-hole rounds).
  History (`/history`) reloads these rows and **recomputes** match play and Auto Press from
  `hole_scores` using the same `src/lib/golf` functions — the betting outcome is never stored,
  only the raw strokes and the betting *context* (`format`, `stake`, `team_a`, `team_b`).

### The golf engine (`src/lib/golf/`) — pure, framework-free, test-covered

This is the heart of the app. Keep it pure (no React, no DB, no `window`) so it runs identically
on the client during play and on History when recomputing:

- `types.ts` — `Game`-adjacent types: `Scores` is `hole → playerId → gross`, `MatchState`, etc.
- `strokes.ts` — handicap stroke allocation. `fieldStrokes` sets the low handicapper to scratch
  and gives everyone else `round((handicap − low) × allowance% / 100)` strokes; `strokesOnHole`
  distributes a player's total strokes across holes by stroke index (hardest holes first).
- `matchplay.ts` — `computeMatch`: net better-ball match play for singles (1v1) or fourball
  (2v2, best net ball per side). Handles closeout (`3&2`), dormie, and live status text.
- `autopress.ts` — **Auto Press**, the house betting format (see the module doc comment and the
  fixtures in `tests/golf.test.ts`). A string of digits where each digit is a match; the opening
  hole spawns three matches (`1-1-1`), winners' matches step up, losers' down, and a new match
  opens when the trailing one reaches 2-up. `autoPressBets` produces the three settled bets:
  front 9 (holes 1–9), back 9 (holes 10–18, fresh string), and overall (continuous 18).
  **Note the STATUS comment**: the regrouping transition rule is not fully pinned down with
  the owner yet — the module is kept isolated and fixture-tested so the rule can be swapped.
- `game.ts` — orchestration over a `Game`: `liveMatches`, `liveAutoPress`, `playerMoney`,
  `effectiveMoney`, plus the `localStorage` persistence. `effectiveMoney` branches on
  `scoringMode`: `total` mode uses manually entered winnings (`game.money`), `hole` mode derives
  money from the Auto Press settlement × stake.
- `course.ts` — the canonical Delhi GC Lodhi course constant (`DELHI_LODHI_BLUE`) plus tee
  metadata. This is the **offline fallback / seed**; the DB (`courses`/`holes`, via `/api/course`)
  is the editable source of truth. The Play page fetches `/api/course` and falls back to the
  bundled constant if it fails.

### Scoring modes

A round is either `hole` (full 18-hole card; enables match play + Auto Press recompute) or
`total` (just an adjusted-gross total per player + manually entered ₹ winnings; no recomputable
match). `play-rounds` nulls out `format`/`stake`/`team_a`/`team_b` for total-only rounds.

### Handicaps (`src/lib/handicap.ts`)

`calcHandicapScore` differential = `(adjustedGross − rating) × 113 / slope`. `calcHandicap`
averages the best 6 of the last 12 differentials. Player handicaps are **derived on the fly**
from score history when setting up a round, not stored as a column.

### API routes (`src/app/api/`)

Thin route handlers over SQL. All import the shared singleton `sql` from `src/lib/db.ts`
(`@/lib/db`), which memoizes one `postgres` pool on `global._sql` in dev to survive HMR.
Key routes: `players`, `courses`/`course`, `rounds` (+ `[id]` GET/DELETE), `play-rounds`
(save a live round), `scores`, `leaderboard`, `seed`, `stroke-calculator`. Deleting a round
cascades to its scores/round_players/hole_scores via FK `ON DELETE CASCADE`.

### Pages & nav

App Router pages: `/` (home), `/play` (the big one — setup + live scoring), `/history`,
`/leaderboard`, `/handicaps`. `src/components/BottomNav.tsx` is the persistent mobile nav;
`src/components/Scorecard.tsx` renders a round's card. `src/app/play/play.css` holds the
Play flow's bespoke styling.

## Conventions

- Path alias `@/*` → `src/*`.
- Internal imports within `src/lib/golf/` use explicit `.ts` extensions (e.g.
  `./strokes.ts`) — this is required for the `node tests/golf.test.ts` runner to resolve them.
- All money is integer rupees (`money_inr`, `stake`). Winnings may be negative.
- The DB is the source of truth for courses and player roster; `course.ts` is only a fallback.
