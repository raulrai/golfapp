import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
await sql`
  CREATE TABLE IF NOT EXISTS player_auth (
    player_id BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    pin_hash TEXT NOT NULL,
    failed_attempts SMALLINT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
await sql`
  CREATE TABLE IF NOT EXISTS live_rounds (
    id BIGSERIAL PRIMARY KEY,
    game JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'live',
    version BIGINT NOT NULL DEFAULT 1,
    player_ids BIGINT[] NOT NULL,
    created_by BIGINT REFERENCES players(id),
    round_id BIGINT REFERENCES rounds(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
await sql`CREATE INDEX IF NOT EXISTS live_rounds_status_idx ON live_rounds(status)`
// Re-point the FK on databases migrated before ON DELETE SET NULL was added —
// without it, deleting a round from History 500s once a live round links to it.
await sql`ALTER TABLE live_rounds DROP CONSTRAINT IF EXISTS live_rounds_round_id_fkey`
await sql`
  ALTER TABLE live_rounds ADD CONSTRAINT live_rounds_round_id_fkey
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE SET NULL`
for (const t of ['player_auth', 'live_rounds']) {
  const [chk] = await sql`SELECT to_regclass(${'public.' + t}) AS t`
  console.log(`${t} table:`, chk.t)
}
await sql.end()
