import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized, currentGroup } from '@/lib/auth'

export async function GET() {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const [player] = await sql`SELECT id, name FROM players WHERE id = ${pid}`
  if (!player) return unauthorized()

  // Every group this player belongs to — drives the switcher, and lets a
  // single-group player render a static label instead of a menu.
  const groups = await sql`
    SELECT g.slug, g.name, g.tracks_money, pg.is_admin, pg.display_name
    FROM groups g
    JOIN player_groups pg ON pg.group_id = g.id AND pg.player_id = ${pid}
    ORDER BY g.id`

  const selected = await currentGroup()
  // Fall back to the player's first membership if the cookie is missing or names
  // a group they don't belong to — never leave them stranded with no group.
  const active = groups.find((g) => g.slug === selected?.slug) ?? groups[0] ?? null

  return NextResponse.json({
    playerId: Number(player.id),
    name: player.name,
    displayName: active?.display_name ?? player.name,
    // isAdmin is group-scoped now: admin of the ACTIVE group, not globally.
    isAdmin: active?.is_admin === true,
    group: active
      ? { slug: active.slug, name: active.name, tracksMoney: active.tracks_money }
      : null,
    groups: groups.map((g) => ({ slug: g.slug, name: g.name, tracksMoney: g.tracks_money })),
  })
}
