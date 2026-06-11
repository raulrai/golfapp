export function calcHandicapScore(
  adjustedGross: number,
  courseRating: number,
  slopeRating: number
): number {
  return (adjustedGross - courseRating) * 113 / slopeRating
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
