import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { calcHandicap, calcStrokeAllowances } from '@/lib/handicap'

export async function POST(req: NextRequest) {
  const { player_ids, pct = 75 } = await req.json()

  const players = await Promise.all((player_ids as number[]).map(async id => {
    const [p] = await sql`SELECT * FROM players WHERE id = ${id}`
    const scores = await sql`
      SELECT handicap_score FROM scores WHERE player_id = ${id}
      ORDER BY played_at DESC LIMIT 12`
    const handicap = calcHandicap(scores.map(s => Number(s.handicap_score)), p.starting_handicap)
    return { id, name: p.name, handicap: Math.round(handicap * 100) / 100 }
  }))

  const result = calcStrokeAllowances(players, pct)
  const backMarker = result.find(p => p.strokes === 0)

  return NextResponse.json({ players: result, backMarker: backMarker?.name, pct })
}
