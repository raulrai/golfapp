import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcStrokeAllowances } from '@/lib/handicap'
import { handicapFor } from '@/lib/handicap-db'
import { requireGroupMember, isErr, allMembersOf } from '@/lib/auth'

export async function GET() {
  const session = await requireGroupMember()
  if (isErr(session)) return session

  // Rounds are group-scoped — this is the listing side of the asymmetry.
  const rounds = await sql`
    SELECT r.*, c.name as course_name, c.course_rating, c.slope_rating
    FROM rounds r LEFT JOIN courses c ON r.course_id = c.id
    WHERE r.group_id = ${session.group.id}
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
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { date, course_id, handicap_pct, player_ids } = await req.json()

  const [course] = await sql`SELECT * FROM courses WHERE id = ${course_id}`
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 400 })
  if (!(await allMembersOf(player_ids as number[], session.group.id))) {
    return NextResponse.json({ error: 'Some players are not in this group' }, { status: 400 })
  }

  const players = await Promise.all((player_ids as number[]).map(async id => {
    const [p] = await sql`SELECT * FROM players WHERE id = ${id}`
    // Global handicap — deliberately not group-filtered.
    const handicap = await handicapFor(id, p.starting_handicap)
    return { id, name: p.name, handicap }
  }))

  const withStrokes = calcStrokeAllowances(players, handicap_pct ?? 75)

  const [round] = await sql`
    INSERT INTO rounds (date, course_id, handicap_pct, group_id)
    VALUES (${date}, ${course_id}, ${handicap_pct ?? 75}, ${session.group.id})
    RETURNING id`

  await Promise.all(withStrokes.map(p =>
    sql`INSERT INTO round_players (round_id, player_id, stroke_allowance) VALUES (${round.id}, ${p.id}, ${p.strokes})`
  ))

  return NextResponse.json({ round_id: round.id, players: withStrokes }, { status: 201 })
}
