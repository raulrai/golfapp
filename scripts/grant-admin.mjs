// Grants players.is_admin to the names passed on the command line.
// Admins may enter scores for anyone, save rounds they didn't play in,
// and delete rounds. Idempotent.
//   node scripts/grant-admin.mjs Poky
import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const names = process.argv.slice(2)
if (names.length === 0) {
  console.error('usage: node scripts/grant-admin.mjs <name> [name...]')
  process.exit(1)
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
const rows = await sql`UPDATE players SET is_admin = true WHERE name IN ${sql(names)} RETURNING id, name`
console.log('granted:', rows.map((r) => `${r.id}:${r.name}`))
const admins = await sql`SELECT id, name FROM players WHERE is_admin = true ORDER BY id`
console.log('current admins:', admins.map((r) => `${r.id}:${r.name}`))
await sql.end()
