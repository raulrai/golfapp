import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized, forbidden } from '@/lib/auth'

/** Discard a live round — for the whole fourball. Members only. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const { id } = await params
  const liveId = Number(id)

  const [round] = await sql`SELECT player_ids, status FROM live_rounds WHERE id = ${liveId}`
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(round.player_ids as (number | string)[]).map(Number).includes(pid)) return forbidden()
  if (round.status === 'discarded') return NextResponse.json({ ok: true })
  if (round.status === 'finished') {
    return NextResponse.json({ error: 'Round is already saved', status: 'finished' }, { status: 409 })
  }

  const rows = await sql`
    UPDATE live_rounds SET status = 'discarded', version = version + 1, updated_at = NOW()
    WHERE id = ${liveId} AND status = 'live'
    RETURNING id`
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Round is being saved', status: 'finishing' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
