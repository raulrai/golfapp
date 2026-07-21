import { NextRequest, NextResponse } from 'next/server'
import { requireGroupMember, isErr, forbidden, allMembersOf } from '@/lib/auth'
import { isGuest, maxGuestsFor } from '@/lib/golf/types'
import { persistFinishedRound } from '@/lib/rounds'
import type { SaveBody } from '@/lib/rounds'

export async function POST(req: NextRequest) {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { playerId, group, isAdmin } = session

  const body = (await req.json()) as SaveBody
  const allIds = (body.players ?? []).map((p) => Number(p.id))
  // Guests carry negative ids and have no players row — they are checked by
  // count, not membership. Everyone else must belong to the group.
  const memberIds = allIds.filter((id) => !isGuest(id))
  const guestIds = allIds.filter((id) => isGuest(id))

  if (allIds.some((id) => !Number.isInteger(id) || id === 0)) {
    return NextResponse.json({ error: 'Bad player ids' }, { status: 400 })
  }
  if (guestIds.length > maxGuestsFor(allIds.length) || new Set(guestIds).size !== guestIds.length) {
    return NextResponse.json({ error: 'Too many guests for this field' }, { status: 400 })
  }
  // A round is always somebody's. The admin bypass below would otherwise let an
  // all-guest card through, and it would belong to nobody's history.
  if (memberIds.length === 0) {
    return NextResponse.json({ error: 'A round needs at least one group member' }, { status: 400 })
  }
  // You may only save a round you played in — unless you're an admin of this group.
  if (!memberIds.includes(playerId) && !isAdmin) return forbidden()
  // Every non-guest on the card must belong to the group the round is filed under.
  if (!(await allMembersOf(memberIds, group.id))) {
    return NextResponse.json({ error: 'Some players are not in this group' }, { status: 400 })
  }

  const result = await persistFinishedRound(body, group)
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, ...(result.players ? { players: result.players } : {}) },
      { status: result.status },
    )
  }
  return NextResponse.json({ round_id: result.roundId }, { status: 201 })
}
