import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized } from '@/lib/auth'

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
    SELECT s.player_id, p.name as player_name, s.adjusted_gross_score, s.handicap_score, s.money_inr, s.holes_played
    FROM scores s JOIN players p ON s.player_id = p.id
    WHERE s.round_id = ${round.id}`

  // Per-hole gross strokes (present only for hole-by-hole rounds) — needed to
  // redraw the scorecard and recompute match play / Auto Press.
  const holeScores = await sql`
    SELECT player_id, hole, strokes
    FROM hole_scores WHERE round_id = ${round.id} ORDER BY hole`

  // The course holes (par + stroke index) the round was played on.
  const holes = round.course_id
    ? await sql`
        SELECT hole, par, stroke_index, yards
        FROM holes WHERE course_id = ${round.course_id} ORDER BY hole`
    : []

  // The round's diary, newest-first.
  const moments = await sql`
    SELECT hole, player_ids, tag, note, ts
    FROM round_moments WHERE round_id = ${round.id} ORDER BY ts DESC`

  return NextResponse.json({ ...round, players, scores, holeScores, holes, moments })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await sessionPlayerId()) === null) return unauthorized()
  const { id } = await params

  // scores, round_players and hole_scores all cascade on round_id.
  const deleted = await sql`DELETE FROM rounds WHERE id = ${Number(id)} RETURNING id`
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ deleted: Number(id) })
}
