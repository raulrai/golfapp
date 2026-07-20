import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicap } from '@/lib/handicap'

export async function GET() {
  const players = await sql`SELECT * FROM players ORDER BY name`

  const result = await Promise.all(players.map(async p => {
    const scores = await sql`
      SELECT handicap_score FROM scores WHERE player_id = ${p.id}
      ORDER BY played_at DESC LIMIT 12`
    const handicap = calcHandicap(scores.map(s => Number(s.handicap_score)), p.starting_handicap)
    const [money] = await sql`SELECT COALESCE(SUM(money_inr), 0) as total FROM scores WHERE player_id = ${p.id}`
    return { ...p, handicap: Math.round(handicap * 100) / 100, money: Number(money.total) }
  }))

  return NextResponse.json(result)
}
