// Reset a player's PIN: deletes their player_auth row so the next login
// claims a fresh PIN. Usage: node scripts/reset-pin.mjs "<player name>"
import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const name = process.argv[2]
if (!name) {
  console.error('Usage: node scripts/reset-pin.mjs "<player name>"')
  process.exit(1)
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
const [player] = await sql`SELECT id, name FROM players WHERE name = ${name}`
if (!player) {
  console.error(`No player named "${name}"`)
  await sql.end()
  process.exit(1)
}
const deleted = await sql`DELETE FROM player_auth WHERE player_id = ${player.id} RETURNING player_id`
console.log(deleted.length
  ? `PIN cleared for ${player.name} — their next login sets a new one.`
  : `${player.name} had no PIN set yet.`)
await sql.end()
