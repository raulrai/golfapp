export type PlayerId = number
export type Format = 'match' | 'autopress' | 'both'
export type ScoringMode = 'hole' | 'total'

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
