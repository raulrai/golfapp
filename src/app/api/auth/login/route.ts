import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import sql from '@/lib/db'
import { hashPin, verifyPin, signSession } from '@/lib/pin'
import { SESSION_COOKIE, SESSION_MAX_AGE_S } from '@/lib/auth'

const MAX_FAILS = 5
const LOCK_SECONDS = 60

async function setSessionCookie(playerId: number) {
  const secret = process.env.AUTH_SECRET!
  const token = signSession(playerId, Date.now() + SESSION_MAX_AGE_S * 1000, secret)
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  })
}

export async function POST(req: NextRequest) {
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 })
  }
  const { playerId, pin } = (await req.json()) as { playerId?: number; pin?: string }
  if (!Number.isInteger(playerId) || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'Pick a player and a 4-digit PIN' }, { status: 400 })
  }

  const [player] = await sql`SELECT id, name FROM players WHERE id = ${playerId!}`
  if (!player) return NextResponse.json({ error: 'Unknown player' }, { status: 404 })

  const [auth] = await sql`
    SELECT pin_hash, failed_attempts, locked_until FROM player_auth WHERE player_id = ${playerId!}`

  if (!auth) {
    // First use — this PIN claims the name. ON CONFLICT guards a race with another device.
    const claimed = await sql`
      INSERT INTO player_auth (player_id, pin_hash) VALUES (${playerId!}, ${hashPin(pin)})
      ON CONFLICT (player_id) DO NOTHING RETURNING player_id`
    if (!claimed.length) {
      return NextResponse.json({ error: 'Someone just set a PIN for this name — try again' }, { status: 409 })
    }
    await setSessionCookie(playerId!)
    return NextResponse.json({ playerId, name: player.name, claimed: true })
  }

  if (auth.locked_until && new Date(auth.locked_until) > new Date()) {
    return NextResponse.json({ error: 'Too many tries — wait a minute' }, { status: 429 })
  }

  if (!verifyPin(pin, auth.pin_hash)) {
    const fails = Number(auth.failed_attempts) + 1
    await sql`
      UPDATE player_auth
      SET failed_attempts = ${fails},
          locked_until = ${fails >= MAX_FAILS ? sql`NOW() + make_interval(secs => ${LOCK_SECONDS})` : null},
          updated_at = NOW()
      WHERE player_id = ${playerId!}`
    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  }

  await sql`
    UPDATE player_auth SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
    WHERE player_id = ${playerId!}`
  await setSessionCookie(playerId!)
  return NextResponse.json({ playerId, name: player.name, claimed: false })
}
