import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicap } from '@/lib/handicap'
import { requireGroupMember, isErr, isMemberOf } from '@/lib/auth'

// Any member may view any fellow member's history — editing is enforced
// separately (own scores only, group admins excepted) in /api/scores and /api/rounds.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { group } = session
  const { id } = await params
  const playerId = Number(id)

  const [player] = await sql`
    SELECT p.id, p.starting_handicap, pg.display_name AS name
    FROM players p
    JOIN player_groups pg ON pg.player_id = p.id AND pg.group_id = ${group.id}
    WHERE p.id = ${playerId}`
  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isMemberOf(playerId, group.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ALL of this player's scores, across every group, tagged with the group they
  // were played in. The handicap is global, and the History page highlights which
  // of the last 12 are the counting six — so if this list were group-filtered the
  // handicap shown would visibly not follow from the rounds beneath it.
  const scores = await sql`
    SELECT s.*, c.name as course_name, c.course_rating, c.slope_rating,
           g.slug AS group_slug, g.name AS group_name,
           (r.group_id = ${group.id}) AS own_group
    FROM scores s
    LEFT JOIN rounds r ON s.round_id = r.id
    LEFT JOIN courses c ON r.course_id = c.id
    LEFT JOIN groups g ON r.group_id = g.id
    WHERE s.player_id = ${playerId}
    ORDER BY s.played_at DESC`

  const last12 = scores.slice(0, 12).map(s => Number(s.handicap_score))
  const handicap = calcHandicap(last12, player.starting_handicap)
  // Money, unlike the handicap, is this group's business only.
  const money = group.tracksMoney
    ? scores.filter(s => s.own_group).reduce((sum, s) => sum + Number(s.money_inr), 0)
    : 0

  return NextResponse.json({
    ...player,
    id: Number(player.id),
    handicap: Math.round(handicap * 100) / 100,
    money,
    tracksMoney: group.tracksMoney,
    scores,
  })
}
