import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicap } from '@/lib/handicap'
import { sessionPlayerId, unauthorized } from '@/lib/auth'

// Any logged-in player may view any player's history — editing is enforced
// separately (own scores only, admins excepted) in /api/scores and /api/rounds.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await sessionPlayerId()) === null) return unauthorized()
  const { id } = await params
  const [player] = await sql`SELECT * FROM players WHERE id = ${Number(id)}`
  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const scores = await sql`
    SELECT s.*, c.name as course_name, c.course_rating, c.slope_rating
    FROM scores s
    LEFT JOIN rounds r ON s.round_id = r.id
    LEFT JOIN courses c ON r.course_id = c.id
    WHERE s.player_id = ${Number(id)}
    ORDER BY s.played_at DESC`

  const last12 = scores.slice(0, 12).map(s => Number(s.handicap_score))
  const handicap = calcHandicap(last12)
  const money = scores.reduce((sum, s) => sum + Number(s.money_inr), 0)

  return NextResponse.json({ ...player, handicap: Math.round(handicap * 100) / 100, money, scores })
}
