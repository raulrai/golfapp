import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
const rid = process.argv[2]
const [r] = await sql`SELECT * FROM rounds WHERE id = ${rid}`
const rp = await sql`SELECT * FROM round_players WHERE round_id = ${rid}`
const sc = await sql`SELECT player_id, adjusted_gross_score, handicap_score, money_inr FROM scores WHERE round_id = ${rid}`
const hs = await sql`SELECT player_id, count(*) holes, sum(strokes) tot FROM hole_scores WHERE round_id = ${rid} GROUP BY player_id`
console.log('round:', r)
console.log('round_players:', rp.length, rp)
console.log('scores:', sc)
console.log('hole_scores:', hs)
await sql.end()
