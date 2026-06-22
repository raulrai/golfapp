# Auto Press — Rules Spec

> The house betting format for the Delhi GC group. This doc is the **single source of truth**
> for how Auto Press behaves, so the engine (`src/lib/golf/autopress.ts`) and its fixtures
> (`tests/golf.test.ts`) can encode the *real* rule rather than an approximation.

| | |
|---|---|
| **Status** | ⚠️ DRAFT — needs owner sign-off on the open questions in §4 |
| **Owner / rule-keeper** | Raul Rai |
| **Engine** | `src/lib/golf/autopress.ts` (pure, framework-free) |
| **Fixtures** | `tests/golf.test.ts` (the §5 sheet below feeds these) |
| **Last updated** | 2026-06-22 |

---

## 1. TL;DR (plain English)

Auto Press is a fourball (2 teams) money game scored as a row of **matches**, written as a
dash-separated string like `2-0-2-0`. **Each digit is its own match = one bet worth one stake.**
The opening hole spins up **three** matches; thereafter the winning team's matches climb and the
losing team's fall, and **new matches ("presses") open automatically** as margins build — hence
"Auto Press". At the end, every match settles independently.

Three separate bets are tracked: **Front 9** (holes 1–9), **Back 9** (holes 10–18, a fresh
string), and **Overall** (one continuous string across 18).

## 2. State & rendering (agreed)

- A match's **margin** is a signed number; the displayed string shows absolute margins joined by `-`.
- **Position ownership:** odd positions (1st, 3rd, 5th…) belong to **Team A** = the team that won
  the **first decided hole**; even positions (2nd, 4th…) belong to **Team B**. (Fixtures are
  "normalised" so A always wins hole 1, to remove mirror-image duplication.)
- **Settlement:** each match with a non-zero margin is won by its owner if the owner is ahead;
  a margin of **0 pushes** (no money). `netToA = (matches won by A) − (matches won by B)`.

## 3. Rules currently implemented (the approximation)

These reproduce the spreadsheet for the **early / most common holes**:

1. **Halved hole (H):** nothing changes.
2. **First decided hole:** three matches open, all to the winner → `1-1-1`.
3. **Each later decided hole:** every open match moves by 1 — the **winning team's matches +1,
   the losing team's −1** (toward / through zero).
4. **New press:** when the **trailing (newest) match reaches a 2-up margin**, a new all-square
   match (`0`) opens at the end.
5. Matches **never close or cap** — they keep accumulating margin. ← _this is the suspect bit._

## 4. OPEN QUESTIONS — to pin down with the owner ⚠️

The model diverges from how it's really played once **several presses are open** and the display
"regroups". Decisions needed:

- **Q1 — Do matches ever close out?** Right now a match's margin grows without limit. A 9-hole
  sweep yields `9-7-9-7-5-3-1` (see §5). In real play, does a match **settle/close when it
  reaches a set margin** (e.g. 2-up), banking a stake and dropping out of the live string?
- **Q2 — Is the number of live matches bounded?** Should there always be ~3 live matches (close
  one as you open one), or does the string genuinely grow all round?
- **Q3 — What exactly is "regrouping"?** When multiple presses are open, do the matches
  **re-pair / collapse / reset** at some trigger? Describe the trigger and the resulting string.
- **Q4 — New-press trigger:** is it only the **trailing** match hitting 2-up that opens a press,
  or **any** match hitting 2-up? Does the new match start at `0`, or carry something forward?
- **Q5 — Settlement weighting:** is each match worth a **flat one stake** regardless of final
  margin, or does a bigger margin pay more (e.g. margin × stake)? (Engine currently: flat.)
- **Q6 — Front / Back / Overall:** confirm Back 9 starts a **fresh** string at hole 10 and
  Overall is a **separate continuous** 18-hole string (not derived from Front+Back).

> How to answer: fill in the **✅ Confirmed** column in §5 with the strings as they'd actually
> read after each hole. Anywhere Confirmed ≠ Engine marks a rule to change in `autoPressStep`.

## 5. Fixture sheet (fill in the ✅ Confirmed column)

`Result` = who won the hole (A / B / H=halved). `Engine` = what the code produces today.
Leave ✅ blank where the engine is already correct; fill it where it's wrong.

### Example 1 — `A A B B B A H A A`
_(spreadsheet source; holes 8–9 were earlier corrected to engine output — please re-confirm)_

| Hole | Result | Engine | ✅ Confirmed |
|---|---|---|---|
| 1 | A | `1-1-1` | |
| 2 | A | `2-0-2-0` | |
| 3 | B | `1-1-1-1` | |
| 4 | B | `0-2-0-2-0` | |
| 5 | B | `1-3-1-3-1` | |
| 6 | A | `0-2-0-2-0` | |
| 7 | H | `0-2-0-2-0` | |
| 8 | A | `1-1-1-1-1` | |
| 9 | A | `2-0-2-0-2-0` | |

### Example 2 — `A B B B B B A A A`
_(corrected per `Golf Auto Press (2).xlsx`)_

| Hole | Result | Engine | ✅ Confirmed |
|---|---|---|---|
| 1 | A | `1-1-1` | |
| 2 | B | `0-2-0` | |
| 3 | B | `1-3-1` | |
| 4 | B | `2-4-2-0` | |
| 5 | B | `3-5-3-1` | |
| 6 | B | `4-6-4-2-0` | |
| 7 | A | `3-5-3-1-1` | |
| 8 | A | `2-4-2-0-2-0` | |
| 9 | A | `1-3-1-1-3-1` | |

### Example 3 — `A A A B B B A B B`

| Hole | Result | Engine | ✅ Confirmed |
|---|---|---|---|
| 1 | A | `1-1-1` | |
| 2 | A | `2-0-2-0` | |
| 3 | A | `3-1-3-1` | |
| 4 | B | `2-0-2-0` | |
| 5 | B | `1-1-1-1` | |
| 6 | B | `0-2-0-2-0` | |
| 7 | A | `1-1-1-1-1` | |
| 8 | B | `0-2-0-2-0` | |
| 9 | B | `1-3-1-3-1` | |

### Stress A — Sweep, `A A A A A A A A A` (probes Q1/Q2: unbounded growth)

| Hole | Result | Engine | ✅ Confirmed |
|---|---|---|---|
| 1 | A | `1-1-1` | |
| 2 | A | `2-0-2-0` | |
| 3 | A | `3-1-3-1` | |
| 4 | A | `4-2-4-2-0` | |
| 5 | A | `5-3-5-3-1` | |
| 6 | A | `6-4-6-4-2-0` | |
| 7 | A | `7-5-7-5-3-1` | |
| 8 | A | `8-6-8-6-4-2-0` | |
| 9 | A | `9-7-9-7-5-3-1` | |

### Stress B — Alternating, `A B A B A B A B A`

| Hole | Result | Engine | ✅ Confirmed |
|---|---|---|---|
| 1 | A | `1-1-1` | |
| 2 | B | `0-2-0` | |
| 3 | A | `1-1-1` | |
| 4 | B | `0-2-0` | |
| 5 | A | `1-1-1` | |
| 6 | B | `0-2-0` | |
| 7 | A | `1-1-1` | |
| 8 | B | `0-2-0` | |
| 9 | A | `1-1-1` | |

### Stress C — `A B B B B B B B B` (one team runs away)

| Hole | Result | Engine | ✅ Confirmed |
|---|---|---|---|
| 1 | A | `1-1-1` | |
| 2 | B | `0-2-0` | |
| 3 | B | `1-3-1` | |
| 4 | B | `2-4-2-0` | |
| 5 | B | `3-5-3-1` | |
| 6 | B | `4-6-4-2-0` | |
| 7 | B | `5-7-5-3-1` | |
| 8 | B | `6-8-6-4-2-0` | |
| 9 | B | `7-9-7-5-3-1` | |

### Stress D — `A A A A B A A B A` (swings while presses are open)

| Hole | Result | Engine | ✅ Confirmed |
|---|---|---|---|
| 1 | A | `1-1-1` | |
| 2 | A | `2-0-2-0` | |
| 3 | A | `3-1-3-1` | |
| 4 | A | `4-2-4-2-0` | |
| 5 | B | `3-1-3-1-1` | |
| 6 | A | `4-2-4-2-0` | |
| 7 | A | `5-3-5-3-1` | |
| 8 | B | `4-2-4-2-0` | |
| 9 | A | `5-3-5-3-1` | |

## 6. Settlement examples (confirm with §5 once rules are set)

- Opening `1-1-1`: positions are A, B, A → owner A is ahead in 2 of 3 → **A wins 2, B wins 1,
  net +1 to A.**
- `0-2-0-2-0`: the two `2`s are at even positions (Team B) and they're ahead → **B wins 2**; the
  three `0`s **push**. Net **−2 to A**.
- A stake (₹) multiplies the per-match result. Whether margin scales the payout is **Q5**.

## 7. How to lock it in (once §5 is filled)

1. Translate the confirmed rule into `autoPressStep` (and, if matches now close out, the
   settlement/close logic) in `src/lib/golf/autopress.ts`.
2. Replace the `expected` arrays in `tests/golf.test.ts` with the **✅ Confirmed** strings from
   §5 (and add the stress scenarios as new fixtures).
3. Run `node tests/golf.test.ts` (Node ≥ 26) until green.
4. No data migration needed: the DB stores only raw strokes + betting context and **recomputes**
   settlements, so every past round reflects the corrected rule automatically.
