import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

// Persist the betting context so a saved round's match play + Auto Press can be
// recomputed later in History. Older rounds keep NULLs and show card-only.
await sql`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS format text`
await sql`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS stake integer`
await sql`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS team_a bigint[]`
await sql`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS team_b bigint[]`

const cols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'rounds' ORDER BY ordinal_position`
console.log('rounds columns:')
for (const c of cols) console.log(`  ${c.column_name} ${c.data_type}`)
await sql.end()
