import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

// Guests play in a round but have no players row — no PIN, no handicap history,
// and no business on the leaderboard. Their whole card is snapshotted here
// instead, so History can still recompute the match play and Auto Press that the
// round was actually settled on. Shape:
//   { players: [{id,name,handicap,strokes}],   // id is negative
//     scores:  { "<hole>": { "<guestId>": gross } },
//     money:   { "<guestId>": inr },
//     gross:   { "<guestId>": { adjusted, holesPlayed } } }
// NULL for every existing round, and for any round played without guests.
await sql`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS guests jsonb`

const cols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'rounds' ORDER BY ordinal_position`
console.log('rounds columns:')
for (const c of cols) console.log(`  ${c.column_name} ${c.data_type}`)
await sql.end()
