import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized } from '@/lib/auth'

export async function GET() {
  const pid = await sessionPlayerId()
  if (pid === null) return unauthorized()
  const [player] = await sql`SELECT id, name, is_admin FROM players WHERE id = ${pid}`
  if (!player) return unauthorized()
  return NextResponse.json({ playerId: Number(player.id), name: player.name, isAdmin: player.is_admin === true })
}
