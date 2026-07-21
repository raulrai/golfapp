import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { requireGroupMember, isErr, allMembersOf } from '@/lib/auth'
import type { Game } from '@/lib/golf/game'

/** This group's live rounds (any member may watch). Rounds idle for 18h+ are
 *  treated as abandoned and hidden — no cleanup job needed. */
export async function GET() {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const rows = await sql`
    SELECT id, game, version, player_ids, updated_at
    FROM live_rounds
    WHERE status = 'live' AND group_id = ${session.group.id}
      AND updated_at > NOW() - INTERVAL '18 hours'
    ORDER BY created_at DESC`
  return NextResponse.json({
    rounds: rows.map((r) => ({
      id: Number(r.id),
      game: r.game,
      version: Number(r.version),
      playerIds: (r.player_ids as (number | string)[]).map(Number),
      updatedAt: r.updated_at,
    })),
  })
}

/** Start a live round. The caller must be one of the round's players. */
export async function POST(req: NextRequest) {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { playerId: pid, group } = session

  const { game } = (await req.json()) as { game?: Game }
  const playerIds = (game?.players ?? []).map((p) => Number(p.id))
  if (!game || playerIds.length < 2 || playerIds.some((id) => !Number.isInteger(id))) {
    return NextResponse.json({ error: 'Bad game payload' }, { status: 400 })
  }
  if (!playerIds.includes(pid)) {
    return NextResponse.json({ error: 'You are not in this fourball' }, { status: 403 })
  }
  if (!(await allMembersOf(playerIds, group.id))) {
    return NextResponse.json({ error: 'Some players are not in this group' }, { status: 400 })
  }

  const [row] = await sql`
    INSERT INTO live_rounds (game, player_ids, created_by, group_id)
    VALUES (${sql.json(game as never)}, ${playerIds}, ${pid}, ${group.id})
    RETURNING id, version`
  return NextResponse.json({ id: Number(row.id), version: Number(row.version) }, { status: 201 })
}
