// Dumps every player's handicap using the EXACT production query, so the
// multi-group work can be proved not to have moved a single one.
//
//   node scripts/snapshot-handicaps.mjs before.json      # write a snapshot
//   node scripts/snapshot-handicaps.mjs after.json before.json   # write + diff
//
// Run it before touching anything, then again after each of: the migration,
// the Gazelle import, and the code deploy. Every diff must be empty.
//
// READ ONLY — this script never writes to the database.
import fs from 'fs'
import postgres from 'postgres'

const [outPath, comparePath] = process.argv.slice(2)
if (!outPath) {
  console.error('usage: node scripts/snapshot-handicaps.mjs <out.json> [compare-to.json]')
  process.exit(1)
}

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

// Mirrors calcHandicap() in src/lib/handicap.ts. Kept independent on purpose:
// if the app's implementation drifts, this snapshot should not drift with it.
const calcHandicap = (overPars, starting) => {
  if (!overPars.length) return starting ?? 0
  const last12 = overPars.slice(0, 12)
  const best = [...last12].sort((a, b) => a - b).slice(0, Math.min(6, last12.length))
  return best.reduce((s, v) => s + v, 0) / best.length
}

const players = await sql`SELECT id, name, starting_handicap FROM players ORDER BY name`
const snapshot = { at: new Date().toISOString(), handicaps: {}, rounds: {} }
for (const p of players) {
  // The production query, verbatim — deliberately NOT filtered by group.
  const rows = await sql`
    SELECT handicap_score FROM scores WHERE player_id = ${p.id}
    ORDER BY played_at DESC LIMIT 12`
  const v = rows.map((r) => Number(r.handicap_score))
  snapshot.handicaps[p.name] = Math.round(calcHandicap(v, p.starting_handicap) * 1e6) / 1e6
  const [c] = await sql`SELECT COUNT(*) c FROM scores WHERE player_id = ${p.id}`
  snapshot.rounds[p.name] = Number(c.c)
}
const [r] = await sql`SELECT COUNT(*) c FROM rounds`
snapshot.totalRounds = Number(r.c)
await sql.end()

fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2))
console.log(`wrote ${outPath} — ${players.length} players, ${snapshot.totalRounds} rounds`)

if (comparePath) {
  const before = JSON.parse(fs.readFileSync(comparePath, 'utf8'))
  const names = [...new Set([...Object.keys(before.handicaps), ...Object.keys(snapshot.handicaps)])].sort()
  const diffs = []
  for (const n of names) {
    const a = before.handicaps[n]
    const b = snapshot.handicaps[n]
    if (a === undefined) diffs.push({ player: n, before: '—', after: b, note: 'NEW PLAYER' })
    else if (b === undefined) diffs.push({ player: n, before: a, after: '—', note: 'DISAPPEARED' })
    else if (Math.abs(a - b) > 1e-9) diffs.push({ player: n, before: a, after: b, note: 'MOVED' })
  }
  console.log(`\ncompared against ${comparePath} (${before.at})`)
  const moved = diffs.filter((d) => d.note !== 'NEW PLAYER')
  if (moved.length) {
    console.table(diffs)
    console.error(`\n✗ ${moved.length} existing handicap(s) moved — this must be zero`)
    process.exit(1)
  }
  if (diffs.length) console.table(diffs)
  console.log('✓ no existing handicap moved')
}
