// Add the Gazelle group's roster and history. STRICTLY ADDITIVE.
//
//   python3 scripts/extract-gazelle-xlsx.py "Gazelle Handicaps - July 2026.xlsx" gazelle.json
//   node scripts/import-gazelle.mjs gazelle.json [--commit]
//
// Without --commit this is a DRY RUN: it parses, classifies, validates, prints
// the plan and exits without touching the database.
//
// ⚠ THIS SCRIPT MUST NEVER DELETE ANYTHING. Its sibling
// scripts/import-handicaps-xlsx.mjs opens by wiping rounds, scores and
// player_auth — correct for the one-off full re-seed it was written for, and
// catastrophic here: it would destroy 1,087 PMT rounds and every PIN. That file
// is the obvious thing to copy, so this note is the guard rail. There is no
// DELETE and no TRUNCATE below, and the run asserts the PMT round count is
// unchanged at the end.
//
// Three classes of sheet name, and every one of the 22 blocks must land in
// exactly one of them or the run aborts:
//
//   SHARED   — the same human as an existing PMT player, under a Gazelle
//              nickname. Gets a Gazelle membership row and NOTHING ELSE. Their
//              Gazelle last-12 is byte-identical to what is already in the DB,
//              so importing it would duplicate rounds and move handicaps.
//   NEW      — a Gazelle-only player. Gets a players row, a membership, and
//              their last 12 scores as single-player rounds.
//   SKIP     — on the sheet but deliberately not on the roster (Imran), the
//              same way Bery is handled on the PMT side.
import fs from 'fs'
import path from 'path'
import postgres from 'postgres'

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: node scripts/import-gazelle.mjs <extracted.json> [--commit]')
  process.exit(1)
}

// Sheet name → the existing players.name of the same human.
const SHARED = {
  "Kartik B'ram": 'Kartik',
  "Ashu B'ram": 'Ashu',
  'Ashu Jain': 'Ashu J',
  'Gaggy': 'Gags',
  'Jaivi': 'JV',
  'Poky': 'Poky',
  'Nutty': 'Nutty',
  'Raul': 'Raul',
  'Luvy': 'Luvy',
  'Bharat': 'Bharat',
}

// Gazelle-only. Jaideep is NOT Tarun — their last-12 differ and the owner
// confirmed they are different people, so he is imported as a new player.
const NEW = ['Sikki', 'Biku', 'Vishal', 'Gaurav', 'Utkarsh', 'Anuj', 'Vijit',
             'Rishab', 'Sam', 'Pran', 'Jaideep']

// On the sheet, deliberately off the roster (no handicap-table entry).
const SKIP = ['Imran']

const GAZELLE_ADMINS = ['Raul', 'Luvy']   // by sheet name
const HISTORY_DEPTH = 12                  // the handicap window; matches the PMT seed
// Distinct from the PMT seed's 2026-07-19 so the two imports are told apart in
// History. Choice is cosmetic: shared players receive no Gazelle rounds at all,
// and the new players have no PMT history to interleave with.
const ANCHOR = new Date('2026-07-18T00:00:00Z')
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const calcHandicap = (overPars) => {
  const last12 = overPars.slice(0, 12)
  const best = [...last12].sort((a, b) => a - b).slice(0, Math.min(6, last12.length))
  return best.reduce((s, v) => s + v, 0) / best.length
}

// ---------------------------------------------------------------- classify

const extract = JSON.parse(fs.readFileSync(file, 'utf8'))
const problems = []
const byName = new Map(extract.players.map((p) => [p.name, p]))

for (const n of [...Object.keys(SHARED), ...NEW, ...SKIP]) {
  if (!byName.has(n)) problems.push(`classified "${n}" is not a block in the sheet`)
}
for (const p of extract.players) {
  const seen = (p.name in SHARED) + NEW.includes(p.name) + SKIP.includes(p.name)
  if (seen === 0) problems.push(`sheet block "${p.name}" is unclassified — add it to SHARED, NEW or SKIP`)
  if (seen > 1) problems.push(`sheet block "${p.name}" is classified more than once`)
}
if (problems.length) {
  console.error('CLASSIFICATION FAILED — nothing written:')
  for (const m of problems) console.error('  ✗ ' + m)
  process.exit(1)
}
console.log(`✓ all ${extract.players.length} sheet blocks classified — ` +
            `${Object.keys(SHARED).length} shared, ${NEW.length} new, ${SKIP.length} skipped\n`)

// ---------------------------------------------------------------------- db

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

const [gazelle] = await sql`SELECT id FROM groups WHERE slug = 'gazelle'`
if (!gazelle) {
  console.error('no gazelle group — run scripts/migrate-groups.mjs first')
  await sql.end(); process.exit(1)
}
const gazelleId = Number(gazelle.id)

const roster = await sql`SELECT id, name FROM players`
const idByName = new Map(roster.map((r) => [r.name, Number(r.id)]))

// Every SHARED name must already exist; no NEW name may.
for (const [sheetName, dbName] of Object.entries(SHARED)) {
  if (!idByName.has(dbName)) problems.push(`shared "${sheetName}" → "${dbName}" has no players row`)
}
for (const n of NEW) {
  if (idByName.has(n)) problems.push(`new player "${n}" already exists — would be a duplicate`)
}
// Idempotence: refuse to run twice.
const [already] = await sql`SELECT COUNT(*) c FROM player_groups WHERE group_id = ${gazelleId}`
if (Number(already.c) > 0) problems.push(`gazelle already has ${already.c} members — this import has already run`)

const [pmtBefore] = await sql`
  SELECT COUNT(*) c FROM rounds WHERE group_id = (SELECT id FROM groups WHERE slug = 'pmt')`
const pmtRoundsBefore = Number(pmtBefore.c)

// The shared players' handicaps must be identical before and after. Capture now.
const sharedBefore = {}
for (const dbName of Object.values(SHARED)) {
  const rows = await sql`
    SELECT handicap_score FROM scores WHERE player_id = ${idByName.get(dbName)}
    ORDER BY played_at DESC LIMIT 12`
  sharedBefore[dbName] = calcHandicap(rows.map((r) => Number(r.handicap_score)))
}

if (problems.length) {
  console.error('VALIDATION FAILED — nothing written:')
  for (const m of problems) console.error('  ✗ ' + m)
  await sql.end(); process.exit(1)
}

// ------------------------------------------------------------------- plan

console.log('SHARED — membership only, no rounds (handicaps must not move):')
console.table(Object.entries(SHARED).map(([sheetName, dbName]) => ({
  sheet: sheetName, player: dbName,
  admin: GAZELLE_ADMINS.includes(sheetName),
  handicap: Math.round(sharedBefore[dbName] * 1000) / 1000,
})))

console.log(`\nNEW — roster + last ${HISTORY_DEPTH} rounds each:`)
console.table(NEW.map((n) => {
  const scores = byName.get(n).scores.slice(0, HISTORY_DEPTH)
  return { player: n, imported: scores.length,
           sheetTotal: byName.get(n).scores.length,
           handicap: Math.round(calcHandicap(scores) * 1000) / 1000,
           fullSheetHcp: Math.round(extract.blockHandicap[n] * 1000) / 1000 }
}))
console.log(`\nSKIPPED: ${SKIP.join(', ')}`)
console.log(`PMT rounds (must not change): ${pmtRoundsBefore}`)

if (!commit) {
  console.log('\nDRY RUN — re-run with --commit to apply.')
  await sql.end(); process.exit(0)
}

// Back up what exists, even though nothing is deleted — cheap insurance.
const backup = {
  at: new Date().toISOString(),
  players: await sql`SELECT * FROM players`,
  player_groups: await sql`SELECT * FROM player_groups`,
  rounds: await sql`SELECT * FROM rounds`,
  scores: await sql`SELECT * FROM scores`,
}
const backupPath = path.join(path.dirname(new URL(import.meta.url).pathname),
                             `../backup-before-gazelle-${Date.now()}.json`)
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
console.log('\nbackup written to', path.resolve(backupPath))

// ------------------------------------------------------------------ write

const [course] = await sql`SELECT id, par FROM courses WHERE is_default = true LIMIT 1`
if (!course) throw new Error('no default course')
const par = Number(course.par)

await sql.begin(async (tx) => {
  // Shared: a Gazelle membership carrying the Gazelle nickname. No rounds.
  for (const [sheetName, dbName] of Object.entries(SHARED)) {
    await tx`
      INSERT INTO player_groups (player_id, group_id, display_name, is_admin)
      VALUES (${idByName.get(dbName)}, ${gazelleId}, ${sheetName},
              ${GAZELLE_ADMINS.includes(sheetName)})`
  }

  // New: player row, membership, and their last 12 rounds.
  for (const name of NEW) {
    const [p] = await tx`INSERT INTO players (name) VALUES (${name}) RETURNING id`
    const pid = Number(p.id)
    await tx`
      INSERT INTO player_groups (player_id, group_id, display_name, is_admin)
      VALUES (${pid}, ${gazelleId}, ${name}, ${GAZELLE_ADMINS.includes(name)})`

    const scores = byName.get(name).scores.slice(0, HISTORY_DEPTH)
    for (const [i, overPar] of scores.entries()) {
      // index 0 is the newest round, so it sits closest to the anchor.
      const date = new Date(ANCHOR.getTime() - i * WEEK_MS).toISOString().slice(0, 10)
      const [round] = await tx`
        INSERT INTO rounds (date, course_id, handicap_pct, group_id)
        VALUES (${date}, ${course.id}, 75, ${gazelleId})
        RETURNING id`
      await tx`
        INSERT INTO round_players (round_id, player_id, stroke_allowance)
        VALUES (${round.id}, ${pid}, 0)`
      // money_inr is 0 throughout — Gazelle does not track money.
      await tx`
        INSERT INTO scores (round_id, player_id, adjusted_gross_score, handicap_score, money_inr, holes_played, played_at)
        VALUES (${round.id}, ${pid}, ${par + overPar}, ${overPar}, 0, 18, ${date})`
    }
  }
})

// ----------------------------------------------------------------- verify

console.log('\nverifying…')
const check = []
for (const [sheetName, dbName] of Object.entries(SHARED)) {
  const rows = await sql`
    SELECT handicap_score FROM scores WHERE player_id = ${idByName.get(dbName)}
    ORDER BY played_at DESC LIMIT 12`
  const after = calcHandicap(rows.map((r) => Number(r.handicap_score)))
  check.push({ player: dbName, as: sheetName,
               before: Math.round(sharedBefore[dbName] * 1e6) / 1e6,
               after: Math.round(after * 1e6) / 1e6,
               ok: Math.abs(after - sharedBefore[dbName]) < 1e-9 })
}
for (const name of NEW) {
  const [p] = await sql`SELECT id FROM players WHERE name = ${name}`
  const rows = await sql`
    SELECT handicap_score FROM scores WHERE player_id = ${p.id}
    ORDER BY played_at DESC LIMIT 12`
  const after = calcHandicap(rows.map((r) => Number(r.handicap_score)))
  const want = calcHandicap(byName.get(name).scores.slice(0, HISTORY_DEPTH))
  check.push({ player: name, as: name,
               before: '—', after: Math.round(after * 1e6) / 1e6,
               ok: Math.abs(after - want) < 1e-9 })
}
console.table(check)

const [pmtAfter] = await sql`
  SELECT COUNT(*) c FROM rounds WHERE group_id = (SELECT id FROM groups WHERE slug = 'pmt')`
const pmtOk = Number(pmtAfter.c) === pmtRoundsBefore
const bad = check.filter((c) => !c.ok)
console.log(`PMT rounds: ${pmtRoundsBefore} → ${Number(pmtAfter.c)} ${pmtOk ? '✓' : '✗ CHANGED'}`)
console.log(bad.length ? `✗ ${bad.length} player(s) do not reconcile` : '✓ every handicap reconciles')
await sql.end()
if (bad.length || !pmtOk) process.exit(1)
