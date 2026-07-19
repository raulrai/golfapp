// Adds players.is_admin and grants it to Raul. Admins may enter rounds
// they didn't play in (e.g. filing someone else's card). Idempotent.
import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`
const rows = await sql`UPDATE players SET is_admin = true WHERE name = 'Raul' RETURNING id, name`
const admins = await sql`SELECT id, name FROM players WHERE is_admin = true ORDER BY id`
console.log('granted:', rows.map((r) => `${r.id}:${r.name}`))
console.log('current admins:', admins.map((r) => `${r.id}:${r.name}`))
await sql.end()
