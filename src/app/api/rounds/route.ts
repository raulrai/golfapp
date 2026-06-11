import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicap, calcStrokeAllowances } from '@/lib/handicap'

export async function GET() {
  const rounds = await sql`
    SELECT r.*, c.name as course_name, c.course_rating, c.slope_rating
    FROM rounds r LEFT JOIN courses c ON r.course_id = c.id
    ORDER BY r.date DESC LIMIT 50`

  const result = await Promise.all(rounds.map(async r => {
    const players = await sql`
      SELECT rp.player_id, p.name, rp.stroke_allowance
      FROM round_players rp JOIN players p ON rp.player_id = p.id
      WHERE rp.round_id = ${r.id}`
    const scores = await sql`
      SELECT s.player_id, p.name as player_name, s.adjusted_gross_score, s.handicap_score, s.money_inr
      FROM scores s JOIN players p ON s.player_id = p.id
      WHERE s.round_id = ${r.id}`
    return { ...r, players, scores }
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { date, course_id, handicap_pct, player_ids } = await req.json()

  const [course] = await sql`SELECT * FROM courses WHERE id = ${course_id}`
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 400 })

  const players = await Promise.all((player_ids as number[]).map(async id => {
    const [p] = await sql`SELECT * FROM players WHERE id = ${id}`
    const scores = await sql`
      SELECT handicap_score FROM scores WHERE player_id = ${id}
      ORDER BY played_at DESC LIMIT 12`
    const handicap = calcHandicap(scores.map(s => Number(s.handicap_score)))
    return { id, name: p.name, handicap }
  }))

  const withStrokes = calcStrokeAllowances(players, handicap_pct ?? 75)

  const [round] = await sql`
    INSERT INTO rounds (date, course_id, handicap_pct)
    VALUES (${date}, ${course_id}, ${handicap_pct ?? 75})
    RETURNING id`

  await Promise.all(withStrokes.map(p =>
    sql`INSERT INTO round_players (round_id, player_id, stroke_allowance) VALUES (${round.id}, ${p.id}, ${p.strokes})`
  ))

  return NextResponse.json({ round_id: round.id, players: withStrokes }, { status: 201 })
}
