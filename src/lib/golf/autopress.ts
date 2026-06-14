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

/**
 * Settle a single string: each match (digit) is its own bet worth one stake.
 * `presses[i] > 0` means that match's owner is ahead; the owner is Team A on
 * odd positions (even index) and Team B on even positions (odd index).
 * Halved matches (margin 0) push.
 */
export interface AutoPressSettlement {
  aWon: number
  bWon: number
  pushes: number
  /** net matches to Team A (aWon − bWon) */
  netToA: number
}

export function settleAutoPress(state: AutoPressState): AutoPressSettlement {
  let aWon = 0
  let bWon = 0
  let pushes = 0
  state.presses.forEach((v, i) => {
    if (v === 0) { pushes++; return }
    const ownerIsA = i % 2 === 0
    const ownerAhead = v > 0
    const winnerIsA = ownerIsA ? ownerAhead : !ownerAhead
    if (winnerIsA) aWon++
    else bWon++
  })
  return { aWon, bWon, pushes, netToA: aWon - bWon }
}

/**
 * The three Auto Press bets from a full list of hole results (front, back,
 * overall). Front = holes 1–9, back = holes 10–18 (a fresh string), overall =
 * one continuous string across all 18. Each is settled independently.
 */
export interface AutoPressBet {
  key: 'front' | 'back' | 'overall'
  label: string
  state: AutoPressState
  string: string
  margin: number
  settlement: AutoPressSettlement
  thru: number
}

export function autoPressBets(results: HoleResult[]): AutoPressBet[] {
  const front = results.slice(0, 9)
  const back = results.slice(9, 18)
  const make = (key: AutoPressBet['key'], label: string, res: HoleResult[]): AutoPressBet => {
    const state = runAutoPress(res)
    return {
      key, label, state,
      string: renderAutoPress(state),
      margin: autoPressMargin(state),
      settlement: settleAutoPress(state),
      thru: res.length,
    }
  }
  return [
    make('front', 'Front 9', front),
    make('back', 'Back 9', back),
    make('overall', 'Overall', results),
  ]
}
