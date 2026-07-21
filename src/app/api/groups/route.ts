import { NextResponse } from 'next/server'
import sql from '@/lib/db'

// Public: the pre-login group picker needs this before anyone is authenticated.
// Carries names only — no roster, no statistics.
export async function GET() {
  const rows = await sql`SELECT slug, name FROM groups ORDER BY id`
  return NextResponse.json(rows.map((r) => ({ slug: r.slug, name: r.name })))
}
