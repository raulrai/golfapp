import { NextRequest, NextResponse } from 'next/server'
import { sessionPlayerId, unauthorized, forbidden, isAdmin } from '@/lib/auth'
import { persistFinishedRound } from '@/lib/rounds'
import type { SaveBody } from '@/lib/rounds'

export async function POST(req: NextRequest) {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const body = (await req.json()) as SaveBody
  // You may only save a round you played in — unless you're an admin.
  const memberIds = (body.players ?? []).map((p) => Number(p.id))
  if (!memberIds.includes(pid) && !(await isAdmin(pid))) return forbidden()
  const result = await persistFinishedRound(body)
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, ...(result.players ? { players: result.players } : {}) },
      { status: result.status },
    )
  }
  return NextResponse.json({ round_id: result.roundId }, { status: 201 })
}
