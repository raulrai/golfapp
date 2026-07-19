import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { verifySessionToken } from '@/lib/pin'

export const SESSION_COOKIE = 'golf_session'
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60

/** The logged-in player's id from the session cookie, or null. */
export async function sessionPlayerId(): Promise<number | null> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token, secret)
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

/** Is this player one of the live round's fourball? (Edit rights are fourball-wide.) */
export async function requireRoundMember(liveRoundId: number, playerId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM live_rounds WHERE id = ${liveRoundId} AND ${playerId} = ANY(player_ids)`
  return rows.length > 0
}
