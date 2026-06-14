import { DELHI_LODHI_BLUE } from './course.ts'
import { computeMatch } from './matchplay.ts'
import { strokesOnHole } from './strokes.ts'
import { runAutoPress, renderAutoPress, autoPressMargin } from './autopress.ts'
import type { HoleResult } from './autopress.ts'
import type { Format, MatchState, PlayerId, Scores, ScoringMode } from './types.ts'

export const COURSE = DELHI_LODHI_BLUE

export interface GamePlayer {
  id: PlayerId
  name: string
  handicap: number
  /** round stroke allowance vs the field low marker (already × allowance %) */
  strokes: number
}

export interface Game {
  id: string
  createdAt: number
  players: GamePlayer[]
  scoringMode: ScoringMode
  format: Format
  /** the two sides — one player each (singles) or two (fourball) */
  teamA: PlayerId[]
  teamB: PlayerId[]
  /** head-to-heads to display when 4 play (e.g. A0 v B0, A1 v B1) */
  singles: [PlayerId, PlayerId][]
  scores: Scores
}

export const strokesById = (g: Game): Record<PlayerId, number> =>
  Object.fromEntries(g.players.map((p) => [p.id, p.strokes]))

export const playerName = (g: Game, id: PlayerId): string =>
  g.players.find((p) => p.id === id)?.name ?? '?'

/** Strokes a given player receives on a given hole. */
export function holeStrokes(g: Game, id: PlayerId, holeN: number): number {
  const p = g.players.find((x) => x.id === id)
  const hole = COURSE.holes[holeN - 1]
  if (!p || !hole) return 0
  return strokesOnHole(p.strokes, hole.si)
}

export interface LiveMatch {
  kind: 'fourball' | 'singles'
  label: string
  a: PlayerId[]
  b: PlayerId[]
  state: MatchState
}

/** All match-play matches for the game (fourball and/or singles), live. */
export function liveMatches(g: Game): LiveMatch[] {
  const sById = strokesById(g)
  const out: LiveMatch[] = []
  const fourball = g.teamA.length === 2 && g.teamB.length === 2
  if (fourball) {
    out.push({
      kind: 'fourball',
      label: `${g.teamA.map((i) => playerName(g, i)).join(' & ')} v ${g.teamB.map((i) => playerName(g, i)).join(' & ')}`,
      a: g.teamA, b: g.teamB,
      state: computeMatch(g.scores, COURSE.holes, sById, g.teamA, g.teamB),
    })
    for (const [pa, pb] of g.singles) {
      out.push({
        kind: 'singles',
        label: `${playerName(g, pa)} v ${playerName(g, pb)}`,
        a: [pa], b: [pb],
        state: computeMatch(g.scores, COURSE.holes, sById, [pa], [pb]),
      })
    }
  } else {
    // 2 players — a single head-to-head
    out.push({
      kind: 'singles',
      label: `${playerName(g, g.teamA[0])} v ${playerName(g, g.teamB[0])}`,
      a: g.teamA, b: g.teamB,
      state: computeMatch(g.scores, COURSE.holes, sById, g.teamA, g.teamB),
    })
  }
  return out
}

/** Per-hole better-ball net result of teamA vs teamB, for completed holes only. */
export function holeResults(g: Game): HoleResult[] {
  const sById = strokesById(g)
  const sideNet = (side: PlayerId[], holeN: number): number | null => {
    const hole = COURSE.holes[holeN - 1]
    const nets: number[] = []
    for (const p of side) {
      const gross = g.scores[holeN]?.[p]
      if (typeof gross !== 'number') return null
      nets.push(gross - strokesOnHole(sById[p] ?? 0, hole.si))
    }
    return nets.length ? Math.min(...nets) : null
  }
  const results: HoleResult[] = []
  for (let h = 1; h <= 18; h++) {
    const a = sideNet(g.teamA, h)
    const b = sideNet(g.teamB, h)
    if (a === null || b === null) break
    results.push(a < b ? 'A' : b < a ? 'B' : 'H')
  }
  return results
}

export interface LiveAutoPress {
  string: string
  margin: number
  leader: PlayerId[] | null
  thru: number
}

export function liveAutoPress(g: Game): LiveAutoPress {
  const results = holeResults(g)
  const state = runAutoPress(results)
  const margin = autoPressMargin(state)
  return {
    string: renderAutoPress(state),
    margin,
    leader: margin === 0 ? null : margin > 0 ? g.teamA : g.teamB,
    thru: results.length,
  }
}

// ---------- persistence (active game in localStorage) ----------
const KEY = 'golf_active_game'

export function loadGame(): Game | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Game) : null
  } catch {
    return null
  }
}

export function saveGame(g: Game | null): void {
  if (typeof window === 'undefined') return
  if (g) localStorage.setItem(KEY, JSON.stringify(g))
  else localStorage.removeItem(KEY)
}
