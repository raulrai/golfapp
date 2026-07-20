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

export function calcHandicap(scores: number[]): number {
  if (scores.length === 0) return 0
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
