/**
 * Hole-18 what-if for Auto Press: with 17 holes in, pre-settle the three
 * possible finishes (A wins 18 / halved / B wins 18). Pure — appends a
 * hypothetical result to the real hole results and re-runs the settlement,
 * so it always agrees with whatever the live Auto Press bar shows.
 */
import { holeResults } from './game.ts'
import type { Game } from './game.ts'
import { autoPressBets } from './autopress.ts'
import type { AutoPressBet, HoleResult } from './autopress.ts'

export interface Hole18Scenario {
  /** the hypothetical hole-18 result */
  outcome: HoleResult
  /** front-9 / back-9 / overall, settled as if the round ended this way */
  bets: AutoPressBet[]
  /** net matches to Team A across all three bets */
  netMatchesToA: number
  /** rupees to Team A (negative = Team B collects); mirrors liveAutoPress */
  moneyToA: number
}

/** The three finishes, in display order A / halved / B — or null unless the
 *  game plays Auto Press and exactly 17 holes are complete. */
export function hole18Scenarios(g: Game): Hole18Scenario[] | null {
  if (g.format !== 'autopress' && g.format !== 'both') return null
  const results = holeResults(g)
  if (results.length !== 17) return null
  return (['A', 'H', 'B'] as HoleResult[]).map((outcome) => {
    const bets = autoPressBets([...results, outcome])
    const netMatchesToA = bets.reduce((acc, b) => acc + b.settlement.netToA, 0)
    return { outcome, bets, netMatchesToA, moneyToA: netMatchesToA * g.stake }
  })
}
