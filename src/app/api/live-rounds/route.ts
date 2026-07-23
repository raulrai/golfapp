import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { requireGroupMember, isErr, membersInGroup, allRegisteredPlayers } from '@/lib/auth'
import { isGuest, maxGuestsFor } from '@/lib/golf/types'
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
  // player_ids does double duty: it is the permission list (who may drive this
  // card) AND the scoring-target list (whose score may be set). Guests belong in
  // the second but not the first, so both go in and every check splits on sign.
  const playerIds = (game?.players ?? []).map((p) => Number(p.id))
  const positiveIds = playerIds.filter((id) => !isGuest(id))
  const guestIds = playerIds.filter((id) => isGuest(id))

  if (!game || playerIds.length < 2 || playerIds.some((id) => !Number.isInteger(id) || id === 0)) {
    return NextResponse.json({ error: 'Bad game payload' }, { status: 400 })
  }
  if (guestIds.length > maxGuestsFor(playerIds.length) || new Set(guestIds).size !== guestIds.length) {
    return NextResponse.json({ error: 'Too many guests for this field' }, { status: 400 })
  }
  // Positive ids are real accounts: this group's members, plus any visiting
  // players linked in from another group.
  const inGroup = await membersInGroup(positiveIds, group.id)
  const visitorIds = positiveIds.filter((id) => !inGroup.has(id))
  // The caller must be a member of this group AND on the card — a guest id can
  // never be the caller, and a visitor drives the round from their own group.
  if (!inGroup.has(pid)) {
    return NextResponse.json({ error: 'You are not in this fourball' }, { status: 403 })
  }
  // A visiting player must be a genuine registered account, never an orphan id.
  if (!(await allRegisteredPlayers(visitorIds))) {
    return NextResponse.json({ error: 'Some players are not registered' }, { status: 400 })
  }

  const [row] = await sql`
    INSERT INTO live_rounds (game, player_ids, created_by, group_id)
    VALUES (${sql.json(game as never)}, ${playerIds}, ${pid}, ${group.id})
    RETURNING id, version`
  return NextResponse.json({ id: Number(row.id), version: Number(row.version) }, { status: 201 })
}
