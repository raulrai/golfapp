import { DELHI_LODHI_BLUE } from './course.ts'
import type { CourseMeta, TeeColor } from './course.ts'
import { computeMatch } from './matchplay.ts'
import { strokesOnHole } from './strokes.ts'
import { autoPressBets } from './autopress.ts'
import type { HoleResult, AutoPressBet } from './autopress.ts'
import type { Format, MatchState, PlayerId, Scores, ScoringMode } from './types.ts'

/** Canonical seed / offline fallback. The DB (via /api/course) is the editable source. */
export const COURSE = DELHI_LODHI_BLUE

/** The course this game is played on — its own snapshot, or the fallback constant. */
export const courseOf = (g: Game): CourseMeta => g.course ?? COURSE

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
  /** handicap allowance % of the difference to the field low marker (e.g. 75, 90, 100) */
  allowancePct: number
  /** the two sides — one player each (singles) or two (fourball) */
  teamA: PlayerId[]
  teamB: PlayerId[]
  /** head-to-heads to display when 4 play (e.g. A0 v B0, A1 v B1) */
  singles: [PlayerId, PlayerId][]
  /** rupees per Auto Press match (each digit is one bet at this stake) */
  stake: number
  scores: Scores
  /** course snapshot for this round (par/SI/yards/tips), fetched from the DB at setup */
  course?: CourseMeta
  /** tee box this round is played from (course snapshot reflects its label/rating/slope) */
  tee?: TeeColor
  /** total-only mode: manually entered winnings per player (₹, may be ±) */
  money?: Record<PlayerId, number>
  /** the day's diary — one-tap tagged moments captured during the round */
  moments?: Moment[]
}

/** A tagged moment in the round's diary (see src/lib/golf/moments.ts for tags). */
export interface Moment {
  id: string
  hole: number
  players: PlayerId[]   // who it's about — may be empty (e.g. a Story note)
  tag: string
  note?: string
  ts: number
}

/** House rule: a hole-by-hole round must reach this many holes to be recorded.
 *  At or above it the cards are pro-rated to 18 (see persistFinishedRound);
 *  below it the whole round is discarded — no scores, no winnings. Total-only
 *  rounds are exempt: they carry a final gross, not a hole count. */
export const MIN_HOLES_TO_RECORD = 14

/** How far the group got: holes carrying at least one player's score. The
 *  minimum is judged for the round as a whole, not per player. */
export function roundHolesPlayed(scores: Scores): number {
  let played = 0
  for (let h = 1; h <= 18; h++) {
    if (Object.values(scores[h] ?? {}).some((s) => typeof s === 'number')) played++
  }
  return played
}

export const strokesById = (g: Game): Record<PlayerId, number> =>
  Object.fromEntries(g.players.map((p) => [p.id, p.strokes]))

export const playerName = (g: Game, id: PlayerId): string =>
  g.players.find((p) => p.id === id)?.name ?? '?'

/** Strokes a given player receives on a given hole. */
export function holeStrokes(g: Game, id: PlayerId, holeN: number): number {
  const p = g.players.find((x) => x.id === id)
  const hole = courseOf(g).holes[holeN - 1]
  if (!p || !hole) return 0
  return strokesOnHole(p.strokes, hole.si)
}

/** A player's running line over the holes they've actually scored. */
export interface PlayerLine {
  holes: number      // holes with a score in
  gross: number      // gross strokes over those holes
  parPlayed: number  // par of those holes
  vsPar: number      // gross − parPlayed
  strokes: number    // handicap strokes received over those holes
  netVsPar: number   // (gross − strokes) − parPlayed
}

export function playerLine(g: Game, id: PlayerId): PlayerLine {
  const holes = courseOf(g).holes
  let gross = 0, n = 0, parPlayed = 0, strokes = 0
  for (let h = 1; h <= 18; h++) {
    const s = g.scores[h]?.[id]
    if (typeof s === 'number') {
      gross += s; n++
      parPlayed += holes[h - 1].par
      strokes += holeStrokes(g, id, h)
    }
  }
  return { holes: n, gross, parPlayed, vsPar: gross - parPlayed, strokes, netVsPar: gross - strokes - parPlayed }
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
  const holes = courseOf(g).holes
  const out: LiveMatch[] = []
  const fourball = g.teamA.length === 2 && g.teamB.length === 2
  if (fourball) {
    out.push({
      kind: 'fourball',
      label: `${g.teamA.map((i) => playerName(g, i)).join(' & ')} v ${g.teamB.map((i) => playerName(g, i)).join(' & ')}`,
      a: g.teamA, b: g.teamB,
      state: computeMatch(g.scores, holes, sById, g.teamA, g.teamB),
    })
    for (const [pa, pb] of g.singles) {
      out.push({
        kind: 'singles',
        label: `${playerName(g, pa)} v ${playerName(g, pb)}`,
        a: [pa], b: [pb],
        state: computeMatch(g.scores, holes, sById, [pa], [pb]),
      })
    }
  } else {
    // 2 players — a single head-to-head
    out.push({
      kind: 'singles',
      label: `${playerName(g, g.teamA[0])} v ${playerName(g, g.teamB[0])}`,
      a: g.teamA, b: g.teamB,
      state: computeMatch(g.scores, holes, sById, g.teamA, g.teamB),
    })
  }
  return out
}

/** Per-hole better-ball net result of teamA vs teamB, for completed holes only. */
export function holeResults(g: Game): HoleResult[] {
  const sById = strokesById(g)
  const holes = courseOf(g).holes
  const sideNet = (side: PlayerId[], holeN: number): number | null => {
    const hole = holes[holeN - 1]
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
  /** front-9, back-9 and overall bets */
  bets: AutoPressBet[]
  /** net matches to Team A across all three bets */
  netMatchesToA: number
  /** rupees to Team A (negative = Team B ahead) across all three bets */
  moneyToA: number
  /** the side currently ahead on money, or null if level */
  leader: PlayerId[] | null
  thru: number
}

export function liveAutoPress(g: Game): LiveAutoPress {
  const results = holeResults(g)
  const bets = autoPressBets(results)
  const netMatchesToA = bets.reduce((acc, b) => acc + b.settlement.netToA, 0)
  const moneyToA = netMatchesToA * g.stake
  return {
    bets,
    netMatchesToA,
    moneyToA,
    leader: moneyToA === 0 ? null : moneyToA > 0 ? g.teamA : g.teamB,
    thru: results.length,
  }
}

/** Per-player money (₹). Auto-press side bet booked in full by each partner. */
export function playerMoney(g: Game): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {}
  for (const p of g.players) out[p.id] = 0
  if (g.format === 'autopress' || g.format === 'both') {
    const { moneyToA } = liveAutoPress(g)
    for (const id of g.teamA) out[id] += moneyToA
    for (const id of g.teamB) out[id] -= moneyToA
  }
  return out
}

/**
 * Money to persist for a game. Total-only mode uses the manually entered
 * winnings; hole-by-hole derives money from the Auto Press settlement.
 */
export function effectiveMoney(g: Game): Record<PlayerId, number> {
  if (g.scoringMode === 'total') {
    const out: Record<PlayerId, number> = {}
    for (const p of g.players) out[p.id] = g.money?.[p.id] ?? 0
    return out
  }
  return playerMoney(g)
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
