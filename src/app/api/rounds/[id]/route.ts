import { NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [round] = await sql`
    SELECT r.*, c.name as course_name, c.course_rating, c.slope_rating
    FROM rounds r LEFT JOIN courses c ON r.course_id = c.id
    WHERE r.id = ${Number(id)}`
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const players = await sql`
    SELECT rp.player_id, p.name, rp.stroke_allowance
    FROM round_players rp JOIN players p ON rp.player_id = p.id
    WHERE rp.round_id = ${round.id}`

  const scores = await sql`
    SELECT s.player_id, p.name as player_name, s.adjusted_gross_score, s.handicap_score, s.money_inr
    FROM scores s JOIN players p ON s.player_id = p.id
    WHERE s.round_id = ${round.id}`

  return NextResponse.json({ ...round, players, scores })
}
