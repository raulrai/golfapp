// One-off: wipe all round/score history and re-seed it from the group's
// Handicaps spreadsheet, so the app and the sheet agree exactly.
//
//   python3 scripts/extract-handicaps-xlsx.py "Handicaps (5).xlsx" handicaps.json
//   node scripts/import-handicaps-xlsx.mjs handicaps.json [--commit]
//
// Without --commit it is a DRY RUN: it parses, validates, prints the diff and
// exits without touching the database.
//
// The sheet's `Score` column is strokes over par, and that is what goes into
// scores.handicap_score — the sheet's handicap is the mean of the best 6 of the
// last 12 over-par scores, which is exactly what calcHandicap() computes. The
// sheet's own handicap table and Order of Merit are re-derived here and used
// as checksums; a mismatch aborts the run.
//
// What the sheet does NOT hold, and this script therefore does not invent:
//   * Dates. Rounds are ordered but undated. Only the ORDER matters (handicaps
//     read `ORDER BY played_at DESC LIMIT 12`), so rounds are back-dated one
//     week apart from --anchor. Those dates are synthetic; History will show them.
//   * Who played with whom. Each player's column is compacted independently, so
//     row N is NOT a shared golf day. Every score becomes a SINGLE-PLAYER round.
import fs from 'fs'
import path from 'path'
import postgres from 'postgres'

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: node scripts/import-handicaps-xlsx.mjs <extracted.json> [--commit]')
  process.exit(1)
}

// Players present in the sheet's Details tab but deliberately left out of its
// own handicap table and Order of Merit. Kept on the roster, but no data.
const SKIP_PLAYERS = new Set(['Bery'])

const ANCHOR = new Date('2026-07-19T00:00:00Z') // newest round sits here
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// ----------------------------------------------------------- load extraction

// `rounds` arrives newest-first (index 0 = most recent), as in the sheet.
const extract = JSON.parse(fs.readFileSync(file, 'utf8'))
const players = extract.players
const sheetHandicap = new Map(Object.entries(extract.sheetHandicap))
const sheetMoney = new Map(Object.entries(extract.sheetMoney))

// ------------------------------------------------------------------- validate

// The app's rule, replicated here so the check is independent of the app.
const calcHandicap = (overPars) => {
  const last12 = overPars.slice(0, 12)
  const best = [...last12].sort((a, b) => a - b).slice(0, Math.min(6, last12.length))
  return best.reduce((s, v) => s + v, 0) / best.length
}

const problems = []
const plan = []
for (const p of players) {
  if (SKIP_PLAYERS.has(p.name)) continue
  const money = p.rounds.reduce((s, r) => s + r.money, 0)
  const handicap = calcHandicap(p.rounds.map((r) => r.overPar))
  const expMoney = sheetMoney.get(p.name)
  const expHcp = sheetHandicap.get(p.name)
  if (expMoney === undefined) problems.push(`${p.name}: not in Order of Merit`)
  else if (money !== expMoney) problems.push(`${p.name}: money ${money} != OOM ${expMoney}`)
  if (expHcp == null) problems.push(`${p.name}: not in handicap table`)
  else if (Math.abs(handicap - expHcp) > 1e-6) problems.push(`${p.name}: handicap ${handicap} != sheet ${expHcp}`)
  plan.push({ ...p, money, handicap })
}

console.log(`parsed ${plan.length} players, ${plan.reduce((s, p) => s + p.rounds.length, 0)} rounds`)
console.table(
  plan.map((p) => ({
    player: p.name,
    rounds: p.rounds.length,
    handicap: Math.round(p.handicap * 1000) / 1000,
    money: p.money,
  })),
)
if (problems.length) {
  console.error('\nVALIDATION FAILED — nothing written:')
  for (const m of problems) console.error('  ✗ ' + m)
  process.exit(1)
}
console.log('✓ every handicap and money total reconciles with the sheet\n')

// ------------------------------------------------------------------------ db

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

const roster = await sql`SELECT id, name FROM players`
const idByName = new Map(roster.map((r) => [r.name, Number(r.id)]))
const missing = plan.filter((p) => !idByName.has(p.name)).map((p) => p.name)
if (missing.length) {
  console.error('players in the sheet with no DB record:', missing.join(', '))
  await sql.end()
  process.exit(1)
}

const [course] = await sql`SELECT id, par FROM courses WHERE is_default = true LIMIT 1`
if (!course) throw new Error('no default course')
const par = Number(course.par)

const before = {}
for (const t of ['rounds', 'round_players', 'scores', 'hole_scores', 'round_moments', 'live_rounds', 'player_auth']) {
  const [r] = await sql`SELECT count(*) c FROM ${sql(t)}`
  before[t] = Number(r.c)
}
console.log('current row counts:', before)

if (!commit) {
  console.log('\nDRY RUN — re-run with --commit to apply.')
  await sql.end()
  process.exit(0)
}

// Back up everything that is about to be destroyed.
const backup = {
  at: new Date().toISOString(),
  rounds: await sql`SELECT * FROM rounds`,
  round_players: await sql`SELECT * FROM round_players`,
  scores: await sql`SELECT * FROM scores`,
  hole_scores: await sql`SELECT * FROM hole_scores`,
  round_moments: await sql`SELECT * FROM round_moments`,
  live_rounds: await sql`SELECT * FROM live_rounds`,
  player_auth: await sql`SELECT * FROM player_auth`,
}
const backupPath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  `../backup-before-import-${Date.now()}.json`,
)
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
console.log('backup written to', path.resolve(backupPath))

await sql.begin(async (tx) => {
  // hole_scores / round_players / scores cascade from rounds, but be explicit.
  await tx`DELETE FROM round_moments`
  await tx`DELETE FROM live_rounds`
  await tx`DELETE FROM hole_scores`
  await tx`DELETE FROM scores`
  await tx`DELETE FROM round_players`
  await tx`DELETE FROM rounds`
  // Every player re-claims a PIN on first login.
  await tx`DELETE FROM player_auth`

  for (const p of plan) {
    const pid = idByName.get(p.name)
    for (const [i, r] of p.rounds.entries()) {
      // index 0 is the newest round, so it sits closest to the anchor date.
      const date = new Date(ANCHOR.getTime() - i * WEEK_MS).toISOString().slice(0, 10)
      const [round] = await tx`
        INSERT INTO rounds (date, course_id, handicap_pct)
        VALUES (${date}, ${course.id}, 75)
        RETURNING id`
      await tx`
        INSERT INTO round_players (round_id, player_id, stroke_allowance)
        VALUES (${round.id}, ${pid}, 0)`
      await tx`
        INSERT INTO scores (round_id, player_id, adjusted_gross_score, handicap_score, money_inr, holes_played, played_at)
        VALUES (${round.id}, ${pid}, ${par + r.overPar}, ${r.overPar}, ${r.money}, 18, ${date})`
    }
  }
})

// ------------------------------------------------------------------- verify

console.log('\nverifying against the DB…')
const check = []
for (const p of plan) {
  const pid = idByName.get(p.name)
  const rows = await sql`
    SELECT handicap_score FROM scores WHERE player_id = ${pid}
    ORDER BY played_at DESC LIMIT 12`
  const dbHcp = calcHandicap(rows.map((r) => Number(r.handicap_score)))
  const [m] = await sql`SELECT COALESCE(SUM(money_inr),0) t FROM scores WHERE player_id = ${pid}`
  check.push({
    player: p.name,
    handicap: Math.round(dbHcp * 1000) / 1000,
    sheet: Math.round(p.handicap * 1000) / 1000,
    money: Number(m.t),
    ok: Math.abs(dbHcp - p.handicap) < 1e-6 && Number(m.t) === p.money,
  })
}
console.table(check)
const bad = check.filter((c) => !c.ok)
console.log(bad.length ? `✗ ${bad.length} player(s) do not reconcile` : '✓ all players reconcile with the sheet')
const [auth] = await sql`SELECT count(*) c FROM player_auth`
console.log('player_auth rows (PINs):', Number(auth.c), '— everyone re-claims on first login')
await sql.end()
