import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { requireGroupMember, isErr } from '@/lib/auth'
import { handicapForRounded } from '@/lib/handicap-db'

export async function GET() {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { group } = session

  const players = await sql`
    SELECT p.id, p.starting_handicap, pg.display_name AS name
    FROM players p
    JOIN player_groups pg ON pg.player_id = p.id AND pg.group_id = ${group.id}
    ORDER BY pg.display_name`

  const rows = await Promise.all(players.map(async p => {
    // Handicap: global, across both groups. Money and round count: this group only.
    const handicap = await handicapForRounded(Number(p.id), p.starting_handicap)
    const [cnt] = await sql`
      SELECT COUNT(*) AS cnt FROM scores s JOIN rounds r ON r.id = s.round_id
      WHERE s.player_id = ${p.id} AND r.group_id = ${group.id}`
    let money = 0
    if (group.tracksMoney) {
      const [m] = await sql`
        SELECT COALESCE(SUM(s.money_inr), 0) AS total
        FROM scores s JOIN rounds r ON r.id = s.round_id
        WHERE s.player_id = ${p.id} AND r.group_id = ${group.id}`
      money = Number(m.total)
    }
    return { ...p, id: Number(p.id), handicap, money, rounds: Number(cnt.cnt) }
  }))

  // A non-money group has no Order of Merit at all — the page is hidden and the
  // list is empty rather than a table of zeroes.
  const byMoney = group.tracksMoney ? [...rows].sort((a, b) => b.money - a.money) : []
  const byHandicap = [...rows].sort((a, b) => a.handicap - b.handicap)

  return NextResponse.json({ byMoney, byHandicap, tracksMoney: group.tracksMoney })
}
