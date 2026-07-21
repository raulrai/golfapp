import sql from '@/lib/db'
import type { Group } from '@/lib/auth'
import { calcHandicapScore } from '@/lib/handicap'
import { effectiveMoney, roundHolesPlayed, MIN_HOLES_TO_RECORD } from '@/lib/golf/game'
import type { Game } from '@/lib/golf/game'

type SaveScores = Record<number, Record<number, number>>

export interface SavePlayer {
  id: number
  strokes: number
}

export interface SaveMoment {
  hole: number
  players: number[]
  tag: string
  note?: string | null
  ts?: number
}

export interface SaveBody {
  date?: string
  scoringMode: 'hole' | 'total'
  handicap_pct?: number
  /** betting context, persisted so History can recompute match play + Auto Press */
  format?: 'match' | 'autopress' | 'both'
  stake?: number
  teamA?: number[]
  teamB?: number[]
  players: SavePlayer[]
  scores: SaveScores
  money?: Record<number, number>
  moments?: SaveMoment[]
}

/** The Game → SaveBody mapping used when a finished round is persisted.
 *  Money is recomputed here (server-side for live rounds) via effectiveMoney,
 *  so the persisted settlement always matches the engine's. */
export function gameToSaveBody(game: Game): SaveBody {
  return {
    scoringMode: game.scoringMode,
    handicap_pct: game.allowancePct,
    format: game.format,
    stake: game.stake,
    teamA: game.teamA,
    teamB: game.teamB,
    players: game.players.map((p) => ({ id: p.id, strokes: p.strokes })),
    scores: game.scores,
    money: effectiveMoney(game),
    moments: (game.moments ?? []).map((m) => ({
      hole: m.hole, players: m.players, tag: m.tag, note: m.note ?? null, ts: m.ts,
    })),
  }
}

/** A player's 18-hole gross for handicap purposes, plus how many holes were
 *  actually scored. A partial hole-by-hole card (1–17 holes) is pro-rated to 18
 *  by scaling the strokes-over-par: projectedOver = round(over × 18 / played),
 *  gross = par18 + projectedOver. Returns null only when nothing is scorable. */
function adjustedGross(
  scores: SaveScores, pid: number, mode: 'hole' | 'total',
  parByHole: Record<number, number>, par18: number,
): { gross: number; holesPlayed: number } | null {
  if (mode === 'total') {
    const t = scores[0]?.[pid]
    return typeof t === 'number' ? { gross: t, holesPlayed: 18 } : null
  }
  let gross = 0, parPlayed = 0, played = 0
  for (let h = 1; h <= 18; h++) {
    const s = scores[h]?.[pid]
    if (typeof s === 'number') { gross += s; parPlayed += parByHole[h] ?? 0; played++ }
  }
  if (played === 0) return null
  if (played === 18 || par18 === 0) return { gross, holesPlayed: played }
  const projectedOver = Math.round((gross - parPlayed) * 18 / played)
  return { gross: par18 + projectedOver, holesPlayed: played }
}

export type PersistResult =
  | { roundId: number }
  | { error: string; status: number; players?: number[] }

/** Write a finished round into rounds/round_players/scores/hole_scores/round_moments,
 *  in one transaction. The single save pipeline for both the legacy client save
 *  and the live-round finish.
 *
 *  `group` decides two things, and both are enforced HERE rather than in the UI:
 *  the round is stamped with group.id, and when the group does not track money
 *  every money_inr is forced to 0. Hiding the money fields in the client is
 *  cosmetic; this is what makes "Gazelle tracks no money" actually true. */
export async function persistFinishedRound(body: SaveBody, group: Group): Promise<PersistResult> {
  const { scoringMode, players, scores, handicap_pct = 75 } = body
  const money = group.tracksMoney ? (body.money ?? {}) : {}
  // Only hole-by-hole rounds carry a recomputable match; total-only rounds don't.
  const format = scoringMode === 'hole' ? (body.format ?? null) : null
  // A non-money group still plays Auto Press — it just settles in matches won,
  // so the stake is meaningless and stored as 0 rather than a phantom rupee rate.
  const stake = scoringMode === 'hole' ? (group.tracksMoney ? (body.stake ?? null) : 0) : null
  const teamA = scoringMode === 'hole' ? (body.teamA ?? null) : null
  const teamB = scoringMode === 'hole' ? (body.teamB ?? null) : null
  const date = body.date ?? new Date().toISOString().split('T')[0]

  // House rule: a short hole-by-hole round is discarded outright — scores and
  // winnings both. Total-only rounds carry a final gross, so they're exempt.
  if (scoringMode === 'hole') {
    const played = roundHolesPlayed(scores)
    if (played < MIN_HOLES_TO_RECORD) {
      return {
        error: `Only ${played} of 18 holes scored — a round needs at least ${MIN_HOLES_TO_RECORD} to be recorded.`,
        status: 422,
      }
    }
  }

  const [course] = await sql`SELECT * FROM courses WHERE is_default = true LIMIT 1`
  if (!course) return { error: 'No default course', status: 400 }

  // Hole pars for this course — needed to pro-rate a partial card to 18 holes.
  const holeRows = await sql`SELECT hole, par FROM holes WHERE course_id = ${course.id} ORDER BY hole`
  const parByHole: Record<number, number> = {}
  for (const r of holeRows) parByHole[Number(r.hole)] = Number(r.par)
  const par18 = holeRows.reduce((a, r) => a + Number(r.par), 0)

  // A player needs at least one scorable hole; partial cards are pro-rated above.
  const grosses = players.map((p) => ({ p, g: adjustedGross(scores, p.id, scoringMode, parByHole, par18) }))
  const incomplete = grosses.filter((x) => x.g === null).map((x) => x.p.id)
  if (incomplete.length) {
    return { error: 'No scores for some players', status: 400, players: incomplete }
  }

  const roundId = await sql.begin(async (tx) => {
    const [round] = await tx`
      INSERT INTO rounds (date, course_id, handicap_pct, format, stake, team_a, team_b, group_id)
      VALUES (${date}, ${course.id}, ${handicap_pct}, ${format}, ${stake},
              ${teamA as number[] | null}, ${teamB as number[] | null}, ${group.id})
      RETURNING id`

    for (const { p, g } of grosses) {
      const handicap_score = calcHandicapScore(g!.gross, par18)
      await tx`
        INSERT INTO round_players (round_id, player_id, stroke_allowance)
        VALUES (${round.id}, ${p.id}, ${p.strokes})`
      await tx`
        INSERT INTO scores (round_id, player_id, adjusted_gross_score, handicap_score, money_inr, holes_played, played_at)
        VALUES (${round.id}, ${p.id}, ${g!.gross}, ${handicap_score}, ${money[p.id] ?? 0}, ${g!.holesPlayed}, ${date})`

      if (scoringMode === 'hole') {
        for (let h = 1; h <= 18; h++) {
          const strokes = scores[h]?.[p.id]
          if (typeof strokes === 'number') {
            await tx`
              INSERT INTO hole_scores (round_id, player_id, hole, strokes)
              VALUES (${round.id}, ${p.id}, ${h}, ${strokes})`
          }
        }
      }
    }

    // The day's diary — saved alongside the round, shown read-only on History.
    for (const m of body.moments ?? []) {
      await tx`
        INSERT INTO round_moments (round_id, hole, player_ids, tag, note, ts)
        VALUES (${round.id}, ${m.hole}, ${m.players as number[]}, ${m.tag}, ${m.note ?? null},
                ${m.ts ? new Date(m.ts) : new Date()})`
    }

    return Number(round.id)
  })

  return { roundId }
}
