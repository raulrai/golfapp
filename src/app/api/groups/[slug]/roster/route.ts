import { NextResponse } from 'next/server'
import sql from '@/lib/db'

// Public, because the name picker runs before login. It therefore carries the
// bare minimum: a name to tap and whether that name already has a PIN (so the
// sheet can say "enter your PIN" rather than "this PIN becomes yours" to the
// ten players who already have one from the other group). No handicaps, no
// money, no round counts — nothing an unauthenticated visitor shouldn't see.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [group] = await sql`SELECT id, name FROM groups WHERE slug = ${slug}`
  if (!group) return NextResponse.json({ error: 'Unknown group' }, { status: 404 })

  const rows = await sql`
    SELECT p.id, pg.display_name AS name, (pa.player_id IS NOT NULL) AS has_pin
    FROM players p
    JOIN player_groups pg ON pg.player_id = p.id AND pg.group_id = ${group.id}
    LEFT JOIN player_auth pa ON pa.player_id = p.id
    ORDER BY pg.display_name`

  return NextResponse.json({
    group: { slug, name: group.name },
    players: rows.map((r) => ({ id: Number(r.id), name: r.name, hasPin: r.has_pin === true })),
  })
}
