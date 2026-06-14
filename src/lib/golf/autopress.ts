/**
 * Auto Press — Raul's house format (2 teams, fourball).
 *
 * The score is a sequence of digits; each digit is one match. Odd positions
 * (1st, 3rd, …) belong to Team A (the team that won the first decided hole),
 * even positions to Team B. The opening hole creates three matches: "1-1-1".
 * Each hole, the winner's matches step up and the loser's step down; the
 * absolute margin is displayed. When the trailing (newest) match reaches a
 * 2-up margin, a new all-square match opens at the end.
 *
 * STATUS: this mechanistic model reproduces the worked spreadsheet examples
 * for the early/most-common holes but diverges once several presses are open
 * and the display "regroups" — a rule we still need to pin down with Raul.
 * Kept isolated and test-covered so we can swap the transition rule cleanly.
 */

export type HoleResult = 'A' | 'B' | 'H'

export interface AutoPressState {
  /** signed margins; + = Team A (odd-position owner) ahead in that match */
  presses: number[]
  /** which real team owns odd positions; null until the first decided hole */
  teamA: string | null
}

export function initAutoPress(): AutoPressState {
  return { presses: [], teamA: null }
}

/** Advance the state by one hole. `result` is normalised to A/B/H. */
export function autoPressStep(state: AutoPressState, result: HoleResult): AutoPressState {
  if (result === 'H') return { ...state, presses: [...state.presses] }

  // First decided hole: three matches open, all to the winner.
  if (state.presses.length === 0) {
    const sign = result === 'A' ? 1 : -1
    return { ...state, presses: [sign, sign, sign] }
  }

  const dir = result === 'A' ? 1 : -1
  const next = state.presses.map((v, i) => {
    // index 0 = position 1 (odd) = Team A's match; winner's matches step up.
    const ownerIsA = i % 2 === 0
    return v + (ownerIsA ? dir : -dir)
  })

  // Open a new match when the trailing one reaches a 2-up margin.
  if (Math.abs(next[next.length - 1]) === 2) next.push(0)
  return { ...state, presses: next }
}

/** Render the canonical dash-separated string, e.g. "2-4-2-0". */
export function renderAutoPress(state: AutoPressState): string {
  if (state.presses.length === 0) return '—'
  return state.presses.map((v) => Math.abs(v)).join('-')
}

/** Net auto-press margin to Team A (sum of A matches − sum of B matches). */
export function autoPressMargin(state: AutoPressState): number {
  return state.presses.reduce((acc, v, i) => acc + (i % 2 === 0 ? v : -v), 0)
}

/** Run a full sequence of hole results from the opening. */
export function runAutoPress(results: HoleResult[]): AutoPressState {
  let s = initAutoPress()
  for (const r of results) s = autoPressStep(s, r)
  return s
}
