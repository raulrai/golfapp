import type { Hole } from './course'

/**
 * Strokes a player receives on a hole of the given stroke index, for a total
 * round allowance. Standard allocation: one stroke on the hardest `n` holes,
 * a second on the hardest `n-18`, and so on.
 */
export function strokesOnHole(totalStrokes: number, si: number, holeCount = 18): number {
  if (totalStrokes <= 0) return 0
  let s = Math.floor(totalStrokes / holeCount)
  const remainder = totalStrokes % holeCount
  if (si <= remainder) s += 1
  return s
}

/** Net score = gross minus strokes received on that hole. */
export function netScore(gross: number, totalStrokes: number, hole: Hole): number {
  return gross - strokesOnHole(totalStrokes, hole.si)
}

/**
 * Field stroke allowances: the low marker plays off scratch, everyone else
 * receives the difference to their handicap × allowance %, rounded.
 */
export function fieldStrokes(
  players: { handicap: number }[],
  allowancePct = 75,
): number[] {
  if (players.length === 0) return []
  const low = Math.min(...players.map((p) => p.handicap))
  return players.map((p) => Math.round((p.handicap - low) * allowancePct / 100))
}
