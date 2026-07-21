import { NextRequest, NextResponse } from 'next/server'
import { requireGroupMember, isErr, forbidden, allMembersOf } from '@/lib/auth'
import { persistFinishedRound } from '@/lib/rounds'
import type { SaveBody } from '@/lib/rounds'

export async function POST(req: NextRequest) {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { playerId, group, isAdmin } = session

  const body = (await req.json()) as SaveBody
  const memberIds = (body.players ?? []).map((p) => Number(p.id))
  // You may only save a round you played in — unless you're an admin of this group.
  if (!memberIds.includes(playerId) && !isAdmin) return forbidden()
  // Every player on the card must belong to the group the round is filed under.
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
