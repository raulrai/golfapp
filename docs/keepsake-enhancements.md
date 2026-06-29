# Keepsake enhancements — porting features from OurRounds / TheOldCourse

> **Status:** Built (all three features implemented) · **Owner:** Raul · **Date:** 2026-06-29
>
> **Money on partial rounds (decided):** only the *score* is pro-rated. ₹ money is recorded
> **as-is** — whatever `effectiveMoney` holds (manually entered winnings, or the Auto Press
> settlement at the point the round ended). Money is never pro-rated.
>
> Brings three features from the travel keepsake apps (`~/OurRounds`, `~/TheOldCourse`)
> into the regular betting app (`~/golfapp`). Photos / video and the AI "Story" are
> **out of scope** for now (they need new media storage / serverless infra).

## Where the apps differ (why a straight copy won't work)

| | golfapp (this repo) | OurRounds / TheOldCourse |
|---|---|---|
| Framework | Next.js 16 App Router, React 19 | Vite + React 18 PWA |
| Data | Postgres via raw `postgres` client; rounds persisted to DB | local-first (localStorage + IndexedDB), single synced JSON row |
| Live round | `Game` object in `localStorage` (`golf_active_game`) | `RoundState` object in localStorage |
| Focus | match play + Auto Press + ₹ money + handicaps | the memory: moments, photos, caddie, story |

So we port the **ideas and UX**, re-implemented against golfapp's `Game` / `localStorage`
live model and its Postgres persistence — not the OurRounds code verbatim.

---

## 1. Personal colour-coded scorecard sheet

**What OurRounds does:** on the scoring screen you tap a player's name → their own
18-hole card pops up as a bottom sheet, every hole coloured eagle/birdie/par/bogey/double/triple,
with a gross · vs-par · net header (`OurRounds/src/screens/Scoring.tsx` → `PlayerCardSheet`,
`Scorecard.tsx`).

**What golfapp has today:** a `Play ↔ Scorecard` tab toggle (`play/page.tsx:391-397`) that
shows the **group** card (`src/components/Scorecard.tsx`, all players as rows). No tap-to-open
single-player card, no net column.

**Change (no DB impact):**

1. New component `src/components/PlayerCardSheet.tsx` — a scrim + bottom sheet that renders
   one player's front/back nine, reusing the existing `relClass` colouring from `Scorecard.tsx`
   (extract `relClass` to a shared helper or copy it). Header shows gross, vs-par, and **net**
   (net per hole = `gross − holeStrokes(game, id, h) − par`, already computed inline in
   `ScoreRow` at `play/page.tsx:455-462` — lift that into a small `playerLine(game, id)` helper
   in `src/lib/golf/game.ts` so both the row and the sheet use it).
2. In `ScoreRow` (`play/page.tsx:444`), make the player-name block a `<button>` that opens the
   sheet for that player (add `onShowCard` prop, `cardId` state in the parent like OurRounds).
3. Add sheet/scrim styling to `src/app/play/play.css` (`.sheet-scrim`, `.sheet`) — none exists yet.

**Effort:** small. Self-contained, pure UI.

---

## 2. Moments diary

**What OurRounds does:** a `📖 Moment` button on the scoring screen opens a sheet with a
one-tap **tag grid**, player chips, and an optional note, all tied to the current hole
(`MomentSheet` in `Scoring.tsx`; tags in `src/lib/moments.ts`; list view in `Moments.tsx`).

**What golfapp has:** nothing.

**Tag set (final, from Raul):**
`Monster Drive` 🚀 · `Pure Class` ✨ · `Up & Down` ⛳️ · `Missed Putt` 😩 · `3 Putt` 😖 ·
`Monster Putt` 🐍 · `Clutch Putt` 🎯 · `Sand Save` 🏖️ · `Trash Talk` 🗣️ · `Story` 📖.
`Story` is the special one — it opens a multi-line note box (the others take an optional one-liner),
mirroring OurRounds' story tag, for a longer diary entry.

**Live model (localStorage):** add to the `Game` interface in `src/lib/golf/game.ts`:

```ts
export interface Moment {
  id: string
  hole: number
  players: PlayerId[]   // who it's about (optional / may be empty)
  tag: string
  note?: string
  ts: number
}
// in Game:
moments?: Moment[]
```

`saveGame`/`loadGame` already serialise the whole `Game`, so moments persist live for free.

**Play screen:**
- A `Moment` button beside `End Round` (`play/page.tsx:431`) opens `MomentSheet`
  (new `src/components/MomentSheet.tsx`): tag grid + player chips + optional one-line note →
  pushes a `Moment` onto `game.moments` via `onChange`.
- Optional third tab on the view toggle (`Play · Scorecard · Moments`) listing the day's
  moments newest-first, with delete — mirrors `Moments.tsx`.

**Persistence (new table):**

```sql
CREATE TABLE IF NOT EXISTS round_moments (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  hole SMALLINT,
  player_ids BIGINT[],
  tag TEXT NOT NULL,
  note TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
```

- `POST /api/play-rounds` (`src/app/api/play-rounds/route.ts`): after writing the round, insert
  `body.moments` rows. Add `moments?` to `SaveBody`.
- `GET /api/rounds/[id]`: also `SELECT … FROM round_moments` and return as `moments`.
- History (`/history`) renders them under the round (read-only), reusing the Moments list UI.
- Mirror in `supabase_schema.sql` and add a one-off `scripts/add-moments-table.mjs` (follows the
  hand-parsed-`.env.local` convention of the other scripts) **or** just document running the SQL.

**Effort:** medium — one new table touched in three places (save, load, schema) plus two
components.

---

## 3. End-round → discard or record

**What golfapp does today:** `End Round` (`play/page.tsx:432`, `:722`, `:725`) calls
`confirm('End this round and clear it?')` then `onChange(null)` — i.e. **discard only**. A
separate `SaveSection` appears *below* once all 18 holes are in (`allComplete`, `:439`).
So "save" and "end/discard" are two disconnected affordances.

**What OurRounds does:** a single explicit end-of-round choice (save vs reset).

**Change:** replace the bare `End Round` button with an **End Round sheet** offering two clear
actions:
- **Save & record** — posts to `/api/play-rounds`, then clears the live round (today's
  `SaveSection` logic, `play/page.tsx:579-624`).
- **Discard** — today's `onChange(null)`, with the confirm.

**Partial rounds — pro-rate to 18 (decided).** golfapp's save route currently **rejects
incomplete cards** (`play-rounds/route.ts`: `'Incomplete card'` 400) because every saved round
feeds the handicap engine, which needs a full-18 gross. Instead of blocking, a partial round is
**pro-rated up to an 18-hole projection** by scaling the strokes-over-par:

```
holesPlayed   = # holes this player has a score for
parPlayed     = Σ par over those holes
overParPlayed = grossPlayed − parPlayed
projectedOverPar = round( overParPlayed × 18 / holesPlayed )
projectedGross   = par18 + projectedOverPar      // stored as adjusted_gross_score
```

Worked examples (par-72 course):
- 2 over through **9** → ×(18/9)=2 → **+4** → gross 76
- 2 over through **6** → ×(18/6)=3 → **+6** → gross 78
- 5 over through **12** → ×1.5 → **+7.5 → +8** → gross 80

Notes / decisions baked in:
- Pro-rating is **per player**, off the holes that player actually has a score for (handles a
  card where players stopped at different holes).
- The **real per-hole strokes** for holes played are still written to `hole_scores` unchanged;
  only the round-level `adjusted_gross_score` (→ `handicap_score`) is the projection.
- `projectedOverPar` is **rounded to the nearest integer**; ties round up (`Math.round`).
- The save route must now fetch the course's per-hole `par` (from the `holes` table) to know
  `parPlayed` — today it only loads the course rating/slope, not hole pars. `adjustedGross()`
  changes from "return null unless 18 holes" to "pro-rate when 1–17 holes present, exact when 18."
- Optional but recommended: a `holes_played SMALLINT` column on `rounds` (or `scores`) so
  History can show "pro-rated from 12 holes" rather than silently presenting a projected total.

**Effort:** small–medium (route math + course-par fetch + an optional flag column).

---

## Suggested build order

1. Personal scorecard sheet (small, no DB, immediate value).
2. End-round sheet with discard / save-&-record + partial-round pro-rating (route math).
3. Moments diary (medium, one migration).

## Open questions for Raul

- **Moment tags:** keep the betting-flavoured set above, or a different list?
- **Moments in History:** read-only display is assumed — want to edit/add moments after the
  fact too?
