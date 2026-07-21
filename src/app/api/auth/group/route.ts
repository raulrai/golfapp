import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized, forbidden, GROUP_COOKIE, SESSION_MAX_AGE_S } from '@/lib/auth'

// Switch the active group. Membership is verified, but no PIN is required: one
// human has one PIN across both groups, so switching is a view change, not a
// re-authentication.
export async function POST(req: NextRequest) {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const { slug } = (await req.json()) as { slug?: string }
  if (!slug) return NextResponse.json({ error: 'Pick a group' }, { status: 400 })

  const [row] = await sql`
    SELECT g.id, g.slug, g.name, g.tracks_money
    FROM groups g
    JOIN player_groups pg ON pg.group_id = g.id AND pg.player_id = ${pid}
    WHERE g.slug = ${slug}`
  if (!row) return forbidden()

  ;(await cookies()).set(GROUP_COOKIE, row.slug, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  })

  return NextResponse.json({ slug: row.slug, name: row.name, tracksMoney: row.tracks_money })
}
