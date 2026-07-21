export type PlayerId = number
export type Format = 'match' | 'autopress' | 'both'
export type ScoringMode = 'hole' | 'total'

/**
 * Guests carry negative ids. They live inside a Game exactly like members —
 * the engine is id-agnostic, so strokes, better-ball and Auto Press all work
 * unchanged — but they have no players row, so at the persistence boundary they
 * are diverted into the rounds.guests JSONB snapshot instead of
 * round_players/scores/hole_scores. That is what keeps them off the leaderboard
 * and out of the handicap calc without a single filter in those queries.
 */
export const isGuest = (id: PlayerId): boolean => id < 0

/** Max guests allowed in a field of this size: 2 in a fourball, 1 in a 2-ball. */
export const maxGuestsFor = (fieldSize: number): number => (fieldSize >= 4 ? 2 : 1)

export interface RoundPlayer {
  id: PlayerId
  name: string
  handicap: number
  /** stroke allowance for this round, relative to the field low marker (already × allowance %) */
  strokes: number
}

/** hole number -> playerId -> gross strokes */
export type Scores = Record<number, Record<PlayerId, number>>

export interface MatchState {
  thru: number
  /** positive = side A up (in net holes) */
  diff: number
  decided: boolean
  winner: 'A' | 'B' | 'half' | null
  /** e.g. "3&2", "2 UP", "HALVED" — only when decided */
  resultText: string
  /** live status, e.g. "2 UP", "AS", "DORMIE 2" */
  statusText: string
}
