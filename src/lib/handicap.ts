/**
 * The per-round number a handicap is averaged from: strokes over par.
 *
 * This is the group's own long-standing convention, carried over from the
 * Handicaps spreadsheet the app replaced — NOT the USGA slope differential
 * `(gross − rating) × 113 / slope`. The two agree around 10 over par and
 * diverge either side (at 5 over the differential reads ~0.6 high, at 20 over
 * ~1.2 low), so mixing them would drift every handicap off the group's basis.
 * Scores at other courses are adjusted by hand, as they were in the sheet.
 */
export function calcHandicapScore(adjustedGross: number, coursePar: number): number {
  return adjustedGross - coursePar
}

/**
 * Mean of the best 6 of the last 12 rounds, in strokes over par.
 *
 * `startingHandicap` covers a player with no rounds yet: without it they read
 * as scratch, which would hand them the back-marker slot and strokes off every
 * genuine low handicapper. It is a seed, not an override — the moment a player
 * posts a score their real record takes over.
 */
export function calcHandicap(scores: number[], startingHandicap?: number | null): number {
  if (scores.length === 0) return startingHandicap ?? 0
  const last12 = scores.slice(0, 12)
  const sorted = [...last12].sort((a, b) => a - b)
  const count = Math.min(6, sorted.length)
  const best = sorted.slice(0, count)
  return best.reduce((s, v) => s + v, 0) / best.length
}

export function calcStrokeAllowances(
  players: { id: number; name: string; handicap: number }[],
  pct: number
): { id: number; name: string; handicap: number; strokes: number }[] {
  if (players.length === 0) return []
  const backMarker = Math.min(...players.map(p => p.handicap))
  return players.map(p => ({
    ...p,
    strokes: Math.round((p.handicap - backMarker) * pct / 100),
  }))
}
