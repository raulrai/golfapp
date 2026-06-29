import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicapScore } from '@/lib/handicap'

type Scores = Record<number, Record<number, number>>

interface SavePlayer {
  id: number
  strokes: number
}

interface SaveMoment {
  hole: number
  players: number[]
  tag: string
  note?: string | null
  ts?: number
}

interface SaveBody {
  date?: string
  scoringMode: 'hole' | 'total'
  handicap_pct?: number
  /** betting context, persisted so History can recompute match play + Auto Press */
  format?: 'match' | 'autopress' | 'both'
  stake?: number
  teamA?: number[]
  teamB?: number[]
  players: SavePlayer[]
  scores: Scores
  money?: Record<number, number>
  moments?: SaveMoment[]
}

/** A player's 18-hole gross for handicap purposes, plus how many holes were
 *  actually scored. A partial hole-by-hole card (1–17 holes) is pro-rated to 18
 *  by scaling the strokes-over-par: projectedOver = round(over × 18 / played),
 *  gross = par18 + projectedOver. Returns null only when nothing is scorable. */
function adjustedGross(
  scores: Scores, pid: number, mode: 'hole' | 'total',
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SaveBody
  const { scoringMode, players, scores, money = {}, handicap_pct = 75 } = body
  // Only hole-by-hole rounds carry a recomputable match; total-only rounds don't.
  const format = scoringMode === 'hole' ? (body.format ?? null) : null
  const stake = scoringMode === 'hole' ? (body.stake ?? null) : null
  const teamA = scoringMode === 'hole' ? (body.teamA ?? null) : null
  const teamB = scoringMode === 'hole' ? (body.teamB ?? null) : null
  const date = body.date ?? new Date().toISOString().split('T')[0]

  const [course] = await sql`SELECT * FROM courses WHERE is_default = true LIMIT 1`
  if (!course) return NextResponse.json({ error: 'No default course' }, { status: 400 })

  const rating = Number(course.course_rating)
  const slope = Number(course.slope_rating)

  // Hole pars for this course — needed to pro-rate a partial card to 18 holes.
  const holeRows = await sql`SELECT hole, par FROM holes WHERE course_id = ${course.id} ORDER BY hole`
  const parByHole: Record<number, number> = {}
  for (const r of holeRows) parByHole[Number(r.hole)] = Number(r.par)
  const par18 = holeRows.reduce((a, r) => a + Number(r.par), 0)

  // A player needs at least one scorable hole; partial cards are pro-rated above.
  const grosses = players.map((p) => ({ p, g: adjustedGross(scores, p.id, scoringMode, parByHole, par18) }))
  const incomplete = grosses.filter((x) => x.g === null).map((x) => x.p.id)
  if (incomplete.length) {
    return NextResponse.json({ error: 'No scores for some players', players: incomplete }, { status: 400 })
  }

  const [round] = await sql`
    INSERT INTO rounds (date, course_id, handicap_pct, format, stake, team_a, team_b)
    VALUES (${date}, ${course.id}, ${handicap_pct}, ${format}, ${stake},
            ${teamA as number[] | null}, ${teamB as number[] | null})
    RETURNING id`

  for (const { p, g } of grosses) {
    const handicap_score = calcHandicapScore(g!.gross, rating, slope)
    await sql`
      INSERT INTO round_players (round_id, player_id, stroke_allowance)
      VALUES (${round.id}, ${p.id}, ${p.strokes})`
    await sql`
      INSERT INTO scores (round_id, player_id, adjusted_gross_score, handicap_score, money_inr, holes_played, played_at)
      VALUES (${round.id}, ${p.id}, ${g!.gross}, ${handicap_score}, ${money[p.id] ?? 0}, ${g!.holesPlayed}, ${date})`

    if (scoringMode === 'hole') {
      for (let h = 1; h <= 18; h++) {
        const strokes = scores[h]?.[p.id]
        if (typeof strokes === 'number') {
          await sql`
            INSERT INTO hole_scores (round_id, player_id, hole, strokes)
            VALUES (${round.id}, ${p.id}, ${h}, ${strokes})`
        }
      }
    }
  }

  // The day's diary — saved alongside the round, shown read-only on History.
  for (const m of body.moments ?? []) {
    await sql`
      INSERT INTO round_moments (round_id, hole, player_ids, tag, note, ts)
      VALUES (${round.id}, ${m.hole}, ${m.players as number[]}, ${m.tag}, ${m.note ?? null},
              ${m.ts ? new Date(m.ts) : new Date()})`
  }

  return NextResponse.json({ round_id: round.id }, { status: 201 })
}
