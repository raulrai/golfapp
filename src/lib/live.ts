import type { Game, Moment } from '@/lib/golf/game'

/** A mutation on a live round. Each op is applied server-side as one atomic
 *  jsonb update targeting a single cell, so concurrent markers never clobber
 *  each other's entries. */
export type LiveOp =
  | { op: 'score'; hole: number; playerId: number; strokes: number | null } // hole 0 = total-mode gross
  | { op: 'money'; playerId: number; amount: number | null }                // total-mode winnings
  | { op: 'moment.add'; moment: Moment }
  | { op: 'moment.delete'; momentId: string }

export type LiveRoundStatus = 'live' | 'finishing' | 'finished' | 'discarded'

export interface LiveRoundSummary {
  id: number
  game: Game
  version: number
  playerIds: number[]
  updatedAt: string
}

/** Pure client-side mirror of the server's per-op jsonb updates — used to
 *  overlay pending (optimistic) ops on the last-known server state. */
export function applyOp(g: Game, op: LiveOp): Game {
  switch (op.op) {
    case 'score': {
      const scores = { ...g.scores, [op.hole]: { ...g.scores[op.hole] } }
      if (op.strokes === null) delete scores[op.hole][op.playerId]
      else scores[op.hole][op.playerId] = op.strokes
      return { ...g, scores }
    }
    case 'money': {
      const money = { ...(g.money ?? {}) }
      if (op.amount === null) delete money[op.playerId]
      else money[op.playerId] = op.amount
      return { ...g, money }
    }
    case 'moment.add':
      return { ...g, moments: [...(g.moments ?? []), op.moment] }
    case 'moment.delete':
      return { ...g, moments: (g.moments ?? []).filter((m) => m.id !== op.momentId) }
  }
}

/** The pending-map key for an op: later ops on the same cell supersede earlier ones. */
export function opKey(op: LiveOp): string {
  switch (op.op) {
    case 'score': return `score:${op.hole}:${op.playerId}`
    case 'money': return `money:${op.playerId}`
    case 'moment.add': return `moment:${op.moment.id}`
    case 'moment.delete': return `moment:${op.momentId}`
  }
}
