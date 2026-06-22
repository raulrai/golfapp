# PRD — Golf App (Delhi GC scoring & betting tracker)

> A mobile-first scoring and betting tracker for a ~20-player golf group at Delhi Golf Club — handicaps, match play, and the group's "Auto Press" money game, with full round history.

| | |
|---|---|
| **Status** | Live |
| **Owner** | Raul Rai |
| **Last updated** | 2026-06-22 |
| **Repo / dir** | `~/golfapp` |
| **Live URL** | https://golfapp-sepia.vercel.app |

---

## 1. Problem & context
A regular ~20-player golf group at Delhi Golf Club (Lodhi course) plays for money using a house betting format ("Auto Press") that's genuinely hard to track and settle by hand, especially across front 9 / back 9 / overall. Handicaps also drift and need recomputing from recent scores. This app is the group's **system of record**: it runs a round live (scoring + live match & Auto Press readouts), settles the money, derives handicaps from history, and keeps a permanent, queryable history and leaderboard. Unlike the event/keepsake apps, this is a recurring-use product for a real community.

## 2. Users
| User | Who they are | What they need |
|---|---|---|
| Primary | The organiser/scorer | Set up a round, score it live, settle the money, save to history |
| Players | ~20 regulars | Their handicap, their history, the leaderboard, who owes whom |

## 3. Goals & non-goals
**Goals**
- Run a live round: setup → hole-by-hole scoring → live match play + Auto Press → settle.
- Correctly compute net better-ball match play and the Auto Press betting outcome.
- Derive player handicaps on the fly from score history (best 6 of last 12).
- Persist every round and recompute betting/match from raw strokes (never store the outcome).
- Maintain editable course/roster data and a group leaderboard.

**Non-goals**
- Not offline-first/PWA — it's an online app backed by a real DB.
- Not single-event; it's ongoing and multi-round.
- No payment processing — it tracks money owed (integer ₹), it doesn't move it.

## 4. Core features
| Feature | Description | MVP? |
|---|---|---|
| Play flow | Setup (players, teams, format, stake) → live hole-by-hole scoring | ✅ |
| Match play engine | Net better-ball: singles (1v1) & fourball (2v2), closeout/dormie/live status | ✅ |
| Auto Press | The house betting format; settles front 9, back 9, and overall | ✅ |
| Scoring modes | `hole` (full card, recomputable) or `total` (adjusted gross + manual ₹) | ✅ |
| Handicaps | Differentials from history, best 6 of 12; derived, not stored | ✅ |
| History | Saved rounds; reloads raw strokes and **recomputes** match & money | ✅ |
| Leaderboard | Group standings | ✅ |
| Course/roster admin | DB-backed courses/holes & players, editable; bundled course as fallback | ✅ |

## 5. User flows & screens
- **Play a round:** `/play` → setup → score holes → live match/Auto Press readouts → save (POST `/api/play-rounds`).
- **Review:** `/history` (recomputed cards & money) · `/leaderboard` · `/handicaps`.
- **Screens / nav:** `/` home, `/play`, `/history`, `/leaderboard`, `/handicaps` + persistent `BottomNav`.

## 6. Data model
**Two-layer split — live vs persisted:**
- **Live round** = client `Game` object in `localStorage` (`golf_active_game`); the whole Play flow runs off it; nothing hits the DB until saved.
- **Persisted** = Postgres: `rounds` + `round_players` + `scores` (+ `hole_scores` for hole-by-hole). History recomputes match/Auto Press from `hole_scores` + betting context (`format`, `stake`, `team_a`, `team_b`). The betting *outcome is never stored* — only raw strokes + context.
- Money is integer rupees (may be negative). Handicaps derived on the fly, not a column.

## 7. Tech stack & architecture
- **Framework / language:** Next.js 16 (App Router) + React 19 + TypeScript. ⚠️ Next 16 has breaking changes vs. older docs — check `node_modules/next/dist/docs/` before writing framework code (see AGENTS.md).
- **Styling:** Tailwind v4; bespoke `play.css` for the Play flow.
- **Data / backend:** Supabase Postgres via the `postgres` (porsager) client — **no ORM, no Supabase SDK**; thin API routes write raw tagged-template SQL through a memoized singleton `@/lib/db`.
- **Hosting:** Vercel.
- **Key decisions:** the golf logic lives in a **pure, framework-free engine** (`src/lib/golf/`: `strokes`, `matchplay`, `autopress`, `game`, `course`) so it runs identically live and on recompute; covered by a plain Node test script (`node tests/golf.test.ts`, Node ≥26). `scripts/*.mjs` are one-off DB maintenance tools (some destructive — read before running).

## 8. Sync, offline & storage
Not offline-first. The in-progress round survives reload via `localStorage`; everything else is server/DB-backed and online. The DB is the source of truth for courses and the player roster; the bundled `DELHI_LODHI_BLUE` course constant is only a seed/fallback.

## 9. Success criteria
- A round's money settles correctly and matches what the group expects — Auto Press included.
- Handicaps stay current automatically from played rounds.
- History is trustworthy: any past round can be reopened and recomputed from raw strokes.

## 10. Later / nice-to-haves
- Pin down the Auto Press regrouping transition rule with the owner (currently isolated & fixture-tested so it can be swapped).
- Player-facing auth so each golfer sees their own money/handicap.
- Export/settle summaries per outing.
