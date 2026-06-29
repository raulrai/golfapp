// One-off migration: add scores.holes_played and the round_moments table.
// Idempotent — safe to run more than once. Run with: node scripts/add-moments-and-holes-played.mjs
import postgres from 'postgres'
import fs from 'fs'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS holes_played SMALLINT DEFAULT 18`

await sql`
  CREATE TABLE IF NOT EXISTS round_moments (
    id BIGSERIAL PRIMARY KEY,
    round_id BIGINT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    hole SMALLINT,
    player_ids BIGINT[],
    tag TEXT NOT NULL,
    note TEXT,
    ts TIMESTAMPTZ DEFAULT NOW()
  )`

const [{ c: scoreCols }] = await sql`
  SELECT count(*) c FROM information_schema.columns
  WHERE table_name = 'scores' AND column_name = 'holes_played'`
const [{ c: momentsTbl }] = await sql`
  SELECT count(*) c FROM information_schema.tables WHERE table_name = 'round_moments'`

console.log('scores.holes_played present:', scoreCols === '1' || Number(scoreCols) === 1)
console.log('round_moments table present:', momentsTbl === '1' || Number(momentsTbl) === 1)

await sql.end()
