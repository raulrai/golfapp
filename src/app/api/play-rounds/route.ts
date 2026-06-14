import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicapScore } from '@/lib/handicap'

type Scores = Record<number, Record<number, number>>

interface SavePlayer {
  id: number
  strokes: number
}

interface SaveBody {
  date?: string
  scoringMode: 'hole' | 'total'
  handicap_pct?: number
  players: SavePlayer[]
  scores: Scores
  money?: Record<number, number>
}

/** Sum a player's gross across the 18 holes (hole mode) or the synthetic total (total mode). */
function adjustedGross(scores: Scores, pid: number, mode: 'hole' | 'total'): number | null {
  if (mode === 'total') {
    const t = scores[0]?.[pid]
    return typeof t === 'number' ? t : null
  }
  let sum = 0
  let counted = 0
  for (let h = 1; h <= 18; h++) {
    const s = scores[h]?.[pid]
    if (typeof s === 'number') { sum += s; counted++ }
  }
  return counted === 18 ? sum : null
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SaveBody
  const { scoringMode, players, scores, money = {}, handicap_pct = 75 } = body
  const date = body.date ?? new Date().toISOString().split('T')[0]

  const [course] = await sql`SELECT * FROM courses WHERE is_default = true LIMIT 1`
  if (!course) return NextResponse.json({ error: 'No default course' }, { status: 400 })

  const rating = Number(course.course_rating)
  const slope = Number(course.slope_rating)

  // Every player must have a complete card before we persist (it feeds handicaps).
  const grosses = players.map((p) => ({ p, gross: adjustedGross(scores, p.id, scoringMode) }))
  const incomplete = grosses.filter((g) => g.gross === null).map((g) => g.p.id)
  if (incomplete.length) {
    return NextResponse.json({ error: 'Incomplete card', players: incomplete }, { status: 400 })
  }

  const [round] = await sql`
    INSERT INTO rounds (date, course_id, handicap_pct)
    VALUES (${date}, ${course.id}, ${handicap_pct})
    RETURNING id`

  for (const { p, gross } of grosses) {
    const handicap_score = calcHandicapScore(gross!, rating, slope)
    await sql`
      INSERT INTO round_players (round_id, player_id, stroke_allowance)
      VALUES (${round.id}, ${p.id}, ${p.strokes})`
    await sql`
      INSERT INTO scores (round_id, player_id, adjusted_gross_score, handicap_score, money_inr, played_at)
      VALUES (${round.id}, ${p.id}, ${gross}, ${handicap_score}, ${money[p.id] ?? 0}, ${date})`

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

  return NextResponse.json({ round_id: round.id }, { status: 201 })
}
