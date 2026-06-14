import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
const rid = process.argv[2]
await sql`DELETE FROM hole_scores WHERE round_id = ${rid}`
await sql`DELETE FROM scores WHERE round_id = ${rid}`
await sql`DELETE FROM round_players WHERE round_id = ${rid}`
await sql`DELETE FROM rounds WHERE id = ${rid}`
console.log('deleted round', rid)
await sql.end()
