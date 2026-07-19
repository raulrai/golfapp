import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicapScore } from '@/lib/handicap'
import { sessionPlayerId, unauthorized, forbidden, isAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const { round_id, player_id, adjusted_gross_score, money_inr, played_at } = await req.json()
  // You may only write your own score — admins may write anyone's.
  if (Number(player_id) !== pid && !(await isAdmin(pid))) return forbidden()

  const [round] = await sql`
    SELECT r.*, c.course_rating, c.slope_rating
    FROM rounds r JOIN courses c ON r.course_id = c.id
    WHERE r.id = ${round_id}`
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 400 })

  const handicap_score = calcHandicapScore(adjusted_gross_score, Number(round.course_rating), Number(round.slope_rating))
  const date = played_at ?? round.date

  const existing = await sql`SELECT id FROM scores WHERE round_id = ${round_id} AND player_id = ${player_id}`
  if (existing.length > 0) {
    await sql`
      UPDATE scores SET adjusted_gross_score = ${adjusted_gross_score}, handicap_score = ${handicap_score}, money_inr = ${money_inr ?? 0}
      WHERE round_id = ${round_id} AND player_id = ${player_id}`
  } else {
    await sql`
      INSERT INTO scores (round_id, player_id, adjusted_gross_score, handicap_score, money_inr, played_at)
      VALUES (${round_id}, ${player_id}, ${adjusted_gross_score}, ${handicap_score}, ${money_inr ?? 0}, ${date})`
  }

  return NextResponse.json({ handicap_score: Math.round(handicap_score * 100) / 100 }, { status: 201 })
}
