import { NextRequest, NextResponse } from 'next/server'
import { sessionPlayerId, unauthorized } from '@/lib/auth'
import { persistFinishedRound } from '@/lib/rounds'
import type { SaveBody } from '@/lib/rounds'

export async function POST(req: NextRequest) {
  if ((await sessionPlayerId()) === null) return unauthorized()
  const body = (await req.json()) as SaveBody
  const result = await persistFinishedRound(body)
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, ...(result.players ? { players: result.players } : {}) },
      { status: result.status },
    )
  }
  return NextResponse.json({ round_id: result.roundId }, { status: 201 })
}
