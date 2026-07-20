// Adds players.starting_handicap — the handicap a player carries until they
// have posted a round. Without it a player with no history reads as scratch,
// which would make them the back marker and hand strokes to everyone else.
// It is a seed, not an override: calcHandicap only consults it when the player
// has no scores at all.
//
//   node scripts/migrate-starting-handicap.mjs            # show current state
//   node scripts/migrate-starting-handicap.mjs Bery=16    # set one or more
//
// Idempotent. Pass `Name=` with an empty value to clear a seed.
import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS starting_handicap REAL`

for (const arg of process.argv.slice(2)) {
  const [name, raw] = arg.split('=')
  const value = raw === '' || raw === undefined ? null : Number(raw)
  if (value !== null && !Number.isFinite(value)) {
    console.error(`skipping ${arg}: not a number`)
    continue
  }
  const [row] = await sql`
    UPDATE players SET starting_handicap = ${value} WHERE name = ${name}
    RETURNING id, name, starting_handicap`
  if (!row) console.error(`skipping ${arg}: no player named ${name}`)
  else console.log(`set ${row.name} -> ${row.starting_handicap ?? '(cleared)'}`)
}

// A seed only has an effect while the player has no rounds; report both.
const rows = await sql`
  SELECT p.name, p.starting_handicap, count(s.id) AS rounds
  FROM players p LEFT JOIN scores s ON s.player_id = p.id
  WHERE p.starting_handicap IS NOT NULL
  GROUP BY p.id, p.name, p.starting_handicap
  ORDER BY p.name`
console.table(
  rows.map((r) => ({
    player: r.name,
    starting_handicap: Number(r.starting_handicap),
    rounds: Number(r.rounds),
    in_effect: Number(r.rounds) === 0,
  })),
)
await sql.end()
