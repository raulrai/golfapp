import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { requireGroupMember, isErr } from '@/lib/auth'
import { handicapAsOfRounded } from '@/lib/handicap-db'

/** This week's Monday and Sunday as YYYY-MM-DD, in IST. `played_at` is a plain
 *  DATE, so we compare against date strings; India has no DST, so the fixed
 *  +5:30 offset is exact year-round. */
function weekBoundsIST(): { monday: string; sunday: string } {
  const IST_MS = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(Date.now() + IST_MS)
  const dow = nowIST.getUTCDay()          // 0 = Sun … 6 = Sat (on the shifted clock)
  const daysSinceMon = (dow + 6) % 7       // Mon → 0, Sun → 6
  const monday = new Date(nowIST)
  monday.setUTCDate(nowIST.getUTCDate() - daysSinceMon)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { monday: fmt(monday), sunday: fmt(sunday) }
}

type Entry = {
  player_id: number
  name: string
  round_id: number
  gross: number | null
  net: number
  played_at: string
}

export async function GET() {
  const session = await requireGroupMember()
  if (isErr(session)) return session
  const { group } = session

  const { monday, sunday } = weekBoundsIST()

  // Net is measured off each player's FULL handicap vs par, so it's comparable
  // across every round this week: net = (gross − par) − handicap = handicap_score
  // − handicap. Guests never appear (no scores row); total-only rounds do
  // (they carry handicap_score).
  const rows = await sql`
    SELECT s.player_id, s.round_id, s.adjusted_gross_score, s.handicap_score, s.played_at,
           COALESCE(pg.display_name, p.name) AS name
    FROM scores s
    JOIN rounds r ON r.id = s.round_id
    JOIN players p ON p.id = s.player_id
    LEFT JOIN player_groups pg ON pg.player_id = s.player_id AND pg.group_id = ${group.id}
    WHERE r.group_id = ${group.id}
      AND s.handicap_score IS NOT NULL
      AND s.played_at >= ${monday} AND s.played_at <= ${sunday}`

  // Net is measured off the handicap FROZEN at the start of the week (best-6-of-12
  // over rounds before this Monday), so a round played this week can't move the
  // handicap it's judged against. The freeze rolls forward automatically next
  // Monday. starting_handicap is the seed for a player with no pre-week history.
  const ids = [...new Set(rows.map((r) => Number(r.player_id)))]
  const starts = ids.length
    ? await sql`SELECT id, starting_handicap FROM players WHERE id = ANY(${ids})`
    : []
  const startById = new Map(starts.map((s) => [Number(s.id), s.starting_handicap]))
  const handicaps = new Map<number, number>()
  for (const id of ids) {
    handicaps.set(id, await handicapAsOfRounded(id, monday, startById.get(id)))
  }

  const entries: Entry[] = rows.map((r) => {
    const pid = Number(r.player_id)
    return {
      player_id: pid,
      name: r.name,
      round_id: Number(r.round_id),
      gross: r.adjusted_gross_score != null ? Number(r.adjusted_gross_score) : null,
      net: Number(r.handicap_score) - (handicaps.get(pid) ?? 0),
      played_at: r.played_at,
    }
  })

  // Best = lowest net (tie-break lower gross). Worst = highest net among the rest
  // (tie-break higher gross), so no round is both — with ≤5 rounds, worst is empty.
  const grossOr = (g: number | null, fallback: number) => (g == null ? fallback : g)
  const best = [...entries]
    .sort((a, b) => a.net - b.net || grossOr(a.gross, Infinity) - grossOr(b.gross, Infinity))
    .slice(0, 5)
  const bestIds = new Set(best.map((e) => e.round_id + ':' + e.player_id))
  const worst = entries
    .filter((e) => !bestIds.has(e.round_id + ':' + e.player_id))
    .sort((a, b) => b.net - a.net || grossOr(b.gross, -Infinity) - grossOr(a.gross, -Infinity))
    .slice(0, 5)

  return NextResponse.json({ weekStart: monday, weekEnd: sunday, best, worst })
}
