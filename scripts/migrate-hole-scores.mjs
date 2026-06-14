import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
await sql`
  CREATE TABLE IF NOT EXISTS hole_scores (
    id bigserial PRIMARY KEY,
    round_id bigint NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id bigint NOT NULL REFERENCES players(id),
    hole smallint NOT NULL,
    strokes smallint NOT NULL,
    UNIQUE (round_id, player_id, hole)
  )`
await sql`CREATE INDEX IF NOT EXISTS hole_scores_round_idx ON hole_scores(round_id)`
const [chk] = await sql`SELECT to_regclass('public.hole_scores') AS t`
console.log('hole_scores table:', chk.t)
await sql.end()
