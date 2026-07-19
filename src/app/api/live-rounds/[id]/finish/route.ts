import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized, forbidden } from '@/lib/auth'
import { gameToSaveBody, persistFinishedRound } from '@/lib/rounds'
import type { Game } from '@/lib/golf/game'

/** Persist the live round into rounds/scores/hole_scores and mark it finished.
 *  The guarded live→finishing transition makes a double-finish from two phones
 *  impossible; money is recomputed server-side so clients can't forge it. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const { id } = await params
  const liveId = Number(id)

  const [round] = await sql`SELECT player_ids, status, round_id FROM live_rounds WHERE id = ${liveId}`
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(round.player_ids as (number | string)[]).map(Number).includes(pid)) return forbidden()

  // Already done? Answer idempotently so the second phone's Save resolves cleanly.
  if (round.status === 'finished') return NextResponse.json({ roundId: Number(round.round_id) })
  if (round.status === 'discarded') {
    return NextResponse.json({ error: 'Round was discarded', status: 'discarded' }, { status: 409 })
  }

  const claimed = await sql`
    UPDATE live_rounds SET status = 'finishing', version = version + 1, updated_at = NOW()
    WHERE id = ${liveId} AND status = 'live'
    RETURNING game`
  if (claimed.length === 0) {
    return NextResponse.json({ error: 'Someone is already saving this round', status: 'finishing' }, { status: 409 })
  }

  try {
    const result = await persistFinishedRound(gameToSaveBody(claimed[0].game as Game))
    if ('error' in result) {
      await sql`
        UPDATE live_rounds SET status = 'live', version = version + 1, updated_at = NOW()
        WHERE id = ${liveId} AND status = 'finishing'`
      return NextResponse.json(
        { error: result.error, ...(result.players ? { players: result.players } : {}) },
        { status: result.status },
      )
    }
    await sql`
      UPDATE live_rounds SET status = 'finished', round_id = ${result.roundId}, version = version + 1, updated_at = NOW()
      WHERE id = ${liveId}`
    return NextResponse.json({ roundId: result.roundId })
  } catch (e) {
    await sql`
      UPDATE live_rounds SET status = 'live', version = version + 1, updated_at = NOW()
      WHERE id = ${liveId} AND status = 'finishing'`
    throw e
  }
}
