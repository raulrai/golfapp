import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { requireGroupMember, isErr } from '@/lib/auth'
import { handicapForRounded } from '@/lib/handicap-db'

export async function GET() {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { group } = session

  // Roster is group-scoped, and the name shown is the group's own nickname.
  const players = await sql`
    SELECT p.id, p.starting_handicap, pg.display_name AS name, pg.is_admin
    FROM players p
    JOIN player_groups pg ON pg.player_id = p.id AND pg.group_id = ${group.id}
    ORDER BY pg.display_name`

  const result = await Promise.all(players.map(async p => {
    // Handicap is NOT group-filtered — see the note in lib/handicap-db.ts.
    const handicap = await handicapForRounded(Number(p.id), p.starting_handicap)
    // Money, by contrast, IS group-scoped, and absent entirely for a non-money group.
    let money = 0
    if (group.tracksMoney) {
      const [m] = await sql`
        SELECT COALESCE(SUM(s.money_inr), 0) AS total
        FROM scores s JOIN rounds r ON r.id = s.round_id
        WHERE s.player_id = ${p.id} AND r.group_id = ${group.id}`
      money = Number(m.total)
    }
    return { ...p, id: Number(p.id), handicap, money }
  }))

  return NextResponse.json(result)
}
