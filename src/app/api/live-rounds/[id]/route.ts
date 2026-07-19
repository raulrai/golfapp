import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized, forbidden } from '@/lib/auth'
import type { LiveOp } from '@/lib/live'

/** Poll endpoint. Pass ?v=<known version>: unchanged rounds return a tiny
 *  { changed: false } payload; otherwise the full game comes back. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((await sessionPlayerId()) === null) return unauthorized()
  const { id } = await params
  const [row] = await sql`
    SELECT game, status, version, round_id FROM live_rounds WHERE id = ${Number(id)}`
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const version = Number(row.version)
  const v = req.nextUrl.searchParams.get('v')
  if (v !== null && Number(v) === version) {
    return NextResponse.json({ version, status: row.status, changed: false })
  }
  return NextResponse.json({
    version,
    status: row.status,
    changed: true,
    game: row.game,
    roundId: row.round_id === null ? null : Number(row.round_id),
  })
}

/** Apply one mutation. Members of the fourball only; each op is a single
 *  atomic jsonb update guarded by status='live'. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const { id } = await params
  const liveId = Number(id)

  const [round] = await sql`SELECT player_ids, status FROM live_rounds WHERE id = ${liveId}`
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const memberIds = (round.player_ids as (number | string)[]).map(Number)
  if (!memberIds.includes(pid)) return forbidden()

  const op = (await req.json()) as LiveOp
  let rows: { version: string | number }[]

  switch (op.op) {
    case 'score': {
      const { hole, playerId, strokes } = op
      if (!Number.isInteger(hole) || hole < 0 || hole > 18 || !memberIds.includes(Number(playerId))) {
        return NextResponse.json({ error: 'Bad score op' }, { status: 400 })
      }
      if (strokes !== null && (!Number.isInteger(strokes) || strokes < 1 || strokes > 99)) {
        return NextResponse.json({ error: 'Bad strokes' }, { status: 400 })
      }
      rows = strokes === null
        ? await sql`
            UPDATE live_rounds
            SET game = game #- ARRAY['scores', ${String(hole)}, ${String(playerId)}],
                version = version + 1, updated_at = NOW()
            WHERE id = ${liveId} AND status = 'live'
            RETURNING version`
        : await sql`
            UPDATE live_rounds
            SET game = jsonb_set(game, ARRAY['scores', ${String(hole)}],
                  COALESCE(game #> ARRAY['scores', ${String(hole)}], '{}'::jsonb)
                  || jsonb_build_object(${String(playerId)}::text, ${strokes}::int)),
                version = version + 1, updated_at = NOW()
            WHERE id = ${liveId} AND status = 'live'
            RETURNING version`
      break
    }
    case 'money': {
      const { playerId, amount } = op
      if (!memberIds.includes(Number(playerId)) || (amount !== null && !Number.isInteger(amount))) {
        return NextResponse.json({ error: 'Bad money op' }, { status: 400 })
      }
      rows = amount === null
        ? await sql`
            UPDATE live_rounds
            SET game = game #- ARRAY['money', ${String(playerId)}],
                version = version + 1, updated_at = NOW()
            WHERE id = ${liveId} AND status = 'live'
            RETURNING version`
        : await sql`
            UPDATE live_rounds
            SET game = jsonb_set(game, ARRAY['money'],
                  COALESCE(game -> 'money', '{}'::jsonb)
                  || jsonb_build_object(${String(playerId)}::text, ${amount}::int)),
                version = version + 1, updated_at = NOW()
            WHERE id = ${liveId} AND status = 'live'
            RETURNING version`
      break
    }
    case 'moment.add': {
      const m = op.moment
      if (!m || typeof m.id !== 'string' || typeof m.tag !== 'string') {
        return NextResponse.json({ error: 'Bad moment' }, { status: 400 })
      }
      rows = await sql`
        UPDATE live_rounds
        SET game = jsonb_set(game, ARRAY['moments'],
              COALESCE(game -> 'moments', '[]'::jsonb) || ${sql.json(m as never)}::jsonb),
            version = version + 1, updated_at = NOW()
        WHERE id = ${liveId} AND status = 'live'
        RETURNING version`
      break
    }
    case 'moment.delete': {
      if (typeof op.momentId !== 'string') {
        return NextResponse.json({ error: 'Bad moment id' }, { status: 400 })
      }
      rows = await sql`
        UPDATE live_rounds
        SET game = jsonb_set(game, ARRAY['moments'], COALESCE((
              SELECT jsonb_agg(m) FROM jsonb_array_elements(COALESCE(game -> 'moments', '[]'::jsonb)) m
              WHERE m ->> 'id' <> ${op.momentId}
            ), '[]'::jsonb)),
            version = version + 1, updated_at = NOW()
        WHERE id = ${liveId} AND status = 'live'
        RETURNING version`
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
  }

  if (rows.length === 0) {
    // Round finished/discarded under us — tell the client where things stand.
    const [cur] = await sql`SELECT status, round_id FROM live_rounds WHERE id = ${liveId}`
    return NextResponse.json(
      { error: 'Round is no longer live', status: cur?.status ?? 'gone', roundId: cur?.round_id ? Number(cur.round_id) : null },
      { status: 409 },
    )
  }
  return NextResponse.json({ version: Number(rows[0].version) })
}
