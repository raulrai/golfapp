import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicapScore } from '@/lib/handicap'
import { sessionPlayerId, unauthorized, forbidden, isAdminOf } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const { round_id, player_id, adjusted_gross_score, money_inr, played_at } = await req.json()

  // Authority follows the ROUND's group, not the group being viewed — editing a
  // PMT round is a PMT-admin act even if you happen to have Gazelle selected.
  const [round] = await sql`
    SELECT r.*, c.par, g.tracks_money
    FROM rounds r
    JOIN courses c ON r.course_id = c.id
    LEFT JOIN groups g ON r.group_id = g.id
    WHERE r.id = ${round_id}`
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 400 })

  // You may only write your own score — admins of that round's group may write anyone's.
  if (Number(player_id) !== pid && !(await isAdminOf(pid, Number(round.group_id)))) return forbidden()

  const handicap_score = calcHandicapScore(adjusted_gross_score, Number(round.par))
  const date = played_at ?? round.date
  // Server-side money suppression — the UI hiding the field is not the guarantee.
  const money = round.tracks_money === false ? 0 : (money_inr ?? 0)

  const existing = await sql`SELECT id FROM scores WHERE round_id = ${round_id} AND player_id = ${player_id}`
  if (existing.length > 0) {
    await sql`
      UPDATE scores SET adjusted_gross_score = ${adjusted_gross_score}, handicap_score = ${handicap_score}, money_inr = ${money}
      WHERE round_id = ${round_id} AND player_id = ${player_id}`
  } else {
    await sql`
      INSERT INTO scores (round_id, player_id, adjusted_gross_score, handicap_score, money_inr, played_at)
      VALUES (${round_id}, ${player_id}, ${adjusted_gross_score}, ${handicap_score}, ${money}, ${date})`
  }

  return NextResponse.json({ handicap_score: Math.round(handicap_score * 100) / 100 }, { status: 201 })
}
