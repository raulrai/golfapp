import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { requireGroupMember, isErr, forbidden, membersInGroup, allRegisteredPlayers } from '@/lib/auth'
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
  // count, not membership. Positive ids are real accounts: either this group's
  // members or visiting players linked in from another group.
  const positiveIds = allIds.filter((id) => !isGuest(id))
  const guestIds = allIds.filter((id) => isGuest(id))

  if (allIds.some((id) => !Number.isInteger(id) || id === 0)) {
    return NextResponse.json({ error: 'Bad player ids' }, { status: 400 })
  }
  if (guestIds.length > maxGuestsFor(allIds.length) || new Set(guestIds).size !== guestIds.length) {
    return NextResponse.json({ error: 'Too many guests for this field' }, { status: 400 })
  }
  // Split the real accounts into this group's members and visitors from elsewhere.
  const inGroup = await membersInGroup(positiveIds, group.id)
  const visitorIds = positiveIds.filter((id) => !inGroup.has(id))
  // A round is filed under, and anchored to, this group — so at least one member
  // must be on it. This also stops the admin bypass below from saving an
  // all-guest or all-visitor card that would belong to nobody's group history.
  if (inGroup.size === 0) {
    return NextResponse.json({ error: 'A round needs at least one group member' }, { status: 400 })
  }
  // You may only save a round you played in — unless you're an admin of this group.
  if (!inGroup.has(playerId) && !isAdmin) return forbidden()
  // A visiting player must be a genuine registered account (linked from another
  // group), never an orphan id.
  if (!(await allRegisteredPlayers(visitorIds))) {
    return NextResponse.json({ error: 'Some players are not registered' }, { status: 400 })
  }

  const result = await persistFinishedRound(body, group)
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, ...(result.players ? { players: result.players } : {}) },
      { status: result.status },
    )
  }

  // Entering a score outside the live round (Solo / "Enter a Score" sheet) writes
  // History but never touches live_rounds — leaving an orphaned 'live' row. If
  // exactly ONE open live round in this group has the same player set, retire it
  // too, so it drops out of Live. Zero or multiple matches: leave it for the 18h
  // idle backstop rather than risk retiring a genuinely different round.
  try {
    const wanted = [...new Set(allIds)].sort((a, b) => a - b).join(',')
    const open = await sql`
      SELECT id, player_ids FROM live_rounds
      WHERE group_id = ${group.id} AND status IN ('live', 'finishing')`
    const matches = open.filter((r) =>
      [...new Set((r.player_ids as (number | string)[]).map(Number))].sort((a, b) => a - b).join(',') === wanted,
    )
    if (matches.length === 1) {
      await sql`
        UPDATE live_rounds
        SET status = 'finished', round_id = ${result.roundId}, version = version + 1, updated_at = NOW()
        WHERE id = ${matches[0].id} AND status IN ('live', 'finishing')`
    }
  } catch { /* reconciliation is best-effort; the 18h backstop still applies */ }

  return NextResponse.json({ round_id: result.roundId }, { status: 201 })
}
