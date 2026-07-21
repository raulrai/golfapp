import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcStrokeAllowances } from '@/lib/handicap'
import { handicapForRounded } from '@/lib/handicap-db'
import { requireGroupMember, isErr, allMembersOf } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { player_ids, pct = 75 } = await req.json()

  if (!(await allMembersOf(player_ids as number[], session.group.id))) {
    return NextResponse.json({ error: 'Some players are not in this group' }, { status: 400 })
  }

  const players = await Promise.all((player_ids as number[]).map(async id => {
    const [p] = await sql`
      SELECT p.starting_handicap, pg.display_name AS name
      FROM players p
      JOIN player_groups pg ON pg.player_id = p.id AND pg.group_id = ${session.group.id}
      WHERE p.id = ${id}`
    // Global handicap — deliberately not group-filtered.
    const handicap = await handicapForRounded(id, p.starting_handicap)
    return { id, name: p.name, handicap }
  }))

  const result = calcStrokeAllowances(players, pct)
  const backMarker = result.find(p => p.strokes === 0)

  return NextResponse.json({ players: result, backMarker: backMarker?.name, pct })
}
