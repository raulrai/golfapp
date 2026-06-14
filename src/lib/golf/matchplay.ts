import type { Hole } from './course'
import type { MatchState, PlayerId, Scores } from './types'
import { strokesOnHole } from './strokes.ts'

const TOTAL_HOLES = 18

/** Net better-ball for a side: the best (lowest) net score among its players, or null if incomplete. */
function sideNet(
  scores: Scores,
  hole: Hole,
  side: PlayerId[],
  strokesById: Record<PlayerId, number>,
): number | null {
  const nets: number[] = []
  for (const p of side) {
    const gross = scores[hole.n]?.[p]
    if (typeof gross !== 'number') return null
    nets.push(gross - strokesOnHole(strokesById[p] ?? 0, hole.si))
  }
  return nets.length ? Math.min(...nets) : null
}

export function holeComplete(scores: Scores, holeN: number, players: PlayerId[]): boolean {
  return players.every((p) => typeof scores[holeN]?.[p] === 'number')
}

/**
 * Net match play between side A and side B (better-ball if 2 per side).
 * Positive diff = A up. Handles closeout (e.g. 3&2) and live status (DORMIE/AS/UP).
 */
export function computeMatch(
  scores: Scores,
  holes: Hole[],
  strokesById: Record<PlayerId, number>,
  a: PlayerId[],
  b: PlayerId[],
): MatchState {
  let diff = 0
  let thru = 0
  let decided = false
  let winner: MatchState['winner'] = null
  let resultText = ''

  for (const hole of holes) {
    const na = sideNet(scores, hole, a, strokesById)
    const nb = sideNet(scores, hole, b, strokesById)
    if (na === null || nb === null) break
    if (na < nb) diff++
    else if (nb < na) diff--
    thru = hole.n
    const remaining = TOTAL_HOLES - hole.n
    if (Math.abs(diff) > remaining) {
      decided = true
      winner = diff > 0 ? 'A' : 'B'
      resultText = remaining === 0 ? `${Math.abs(diff)} UP` : `${Math.abs(diff)}&${remaining}`
      break
    }
  }

  if (!decided && thru === TOTAL_HOLES) {
    decided = true
    winner = 'half'
    resultText = 'HALVED'
  }

  const remaining = TOTAL_HOLES - thru
  let statusText: string
  if (decided) statusText = resultText
  else if (thru === 0) statusText = '—'
  else if (diff === 0) statusText = 'AS'
  else if (Math.abs(diff) === remaining) statusText = `DORMIE ${Math.abs(diff)}`
  else statusText = `${Math.abs(diff)} UP`

  return { thru, diff, decided, winner, resultText, statusText }
}
