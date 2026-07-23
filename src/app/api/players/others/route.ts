import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { requireGroupMember, isErr } from '@/lib/auth'
import { handicapForRounded } from '@/lib/handicap-db'

/**
 * Registered players who are NOT in the caller's current group — the pool the
 * Play setup type-ahead links a guest seat to (a "visiting player"). Each row
 * carries the human's global name, the group(s) they belong to (for the tag),
 * and their global handicap (which sets the visitor's strokes for the round).
 *
 * This deliberately exposes other groups' player names to any logged-in member,
 * which the roster (/api/players) does not. It is the one place cross-group
 * names leak, and it is acceptable for a single ~20-person club.
 */
export async function GET() {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { group } = session

  const rows = await sql`
    SELECT p.id, p.name, p.starting_handicap,
           array_agg(g.name ORDER BY g.id) AS group_names
    FROM players p
    JOIN player_groups pg ON pg.player_id = p.id
    JOIN groups g ON g.id = pg.group_id
    WHERE NOT EXISTS (
      SELECT 1 FROM player_groups mine
      WHERE mine.player_id = p.id AND mine.group_id = ${group.id}
    )
    GROUP BY p.id, p.name, p.starting_handicap
    ORDER BY p.name`

  const result = await Promise.all(rows.map(async (p) => ({
    id: Number(p.id),
    name: p.name,
    groups: (p.group_names as string[]) ?? [],
    handicap: await handicapForRounded(Number(p.id), p.starting_handicap),
  })))

  return NextResponse.json(result)
}
