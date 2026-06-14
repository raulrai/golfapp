import postgres from 'postgres'
import fs from 'fs'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

const CUT = '2026-06-11 19:50:00+00'

// 1. Seeded rows (before cutoff) that carry MANUAL markers — should be 0
const [a] = await sql`SELECT count(*) c FROM rounds r WHERE r.created_at < ${CUT} AND EXISTS (SELECT 1 FROM round_players rp WHERE rp.round_id = r.id)`
const [b] = await sql`SELECT count(*) c FROM scores WHERE entered_at < ${CUT} AND adjusted_gross_score IS NOT NULL`
console.log('seeded rounds with round_players (want 0):', a.c)
console.log('seeded scores with adjusted_gross_score (want 0):', b.c)

// 2. Manual markers that sit OUTSIDE the post-cutoff window — should be 0
const [c] = await sql`SELECT count(*) c FROM round_players rp JOIN rounds r ON r.id = rp.round_id WHERE r.created_at < ${CUT}`
const [d] = await sql`SELECT count(*) c FROM scores WHERE adjusted_gross_score IS NOT NULL AND entered_at < ${CUT}`
console.log('round_players on pre-cutoff rounds (want 0):', c.c)
console.log('manual scores pre-cutoff (want 0):', d.c)

// 3. Any post-cutoff SCORES attached to a PRE-cutoff (seeded) round? (would be missed by round-based delete)
const orphanScores = await sql`
  SELECT s.id, s.round_id, s.player_id, s.adjusted_gross_score, s.entered_at
  FROM scores s JOIN rounds r ON r.id = s.round_id
  WHERE s.entered_at >= ${CUT} AND r.created_at < ${CUT}`
console.log('post-cutoff scores on seeded rounds:', orphanScores.length, orphanScores)

// 4. The post-cutoff rounds — full detail to reconcile 17 vs 18
const postRounds = await sql`
  SELECT r.id, r.date, r.created_at,
    (SELECT count(*) FROM round_players rp WHERE rp.round_id = r.id) AS players,
    (SELECT count(*) FROM scores s WHERE s.round_id = r.id) AS scores
  FROM rounds r WHERE r.created_at >= ${CUT} ORDER BY r.created_at`
console.log('post-cutoff rounds:', postRounds.length)
for (const r of postRounds) console.log('  ', r.id, r.date, r.created_at.toISOString(), 'players=' + r.players, 'scores=' + r.scores)

// 5. What would be deleted
const [delR] = await sql`SELECT count(*) c FROM rounds WHERE created_at >= ${CUT}`
const [delS] = await sql`SELECT count(*) c FROM scores s JOIN rounds r ON r.id = s.round_id WHERE r.created_at >= ${CUT}`
const [delRP] = await sql`SELECT count(*) c FROM round_players rp JOIN rounds r ON r.id = rp.round_id WHERE r.created_at >= ${CUT}`
console.log(`WOULD DELETE -> rounds: ${delR.c}, scores: ${delS.c}, round_players: ${delRP.c}`)

await sql.end()
