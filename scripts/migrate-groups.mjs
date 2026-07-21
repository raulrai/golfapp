// Multi-group support: PMT + Gazelle.
//
// A round belongs to a group. A score belongs to a human. Ten players are in
// both groups, so `scores` deliberately gets NO group_id — that is what makes
// a shared handicap fall out for free with nothing to sync.
//
//   node scripts/migrate-groups.mjs            # structure + backfill (safe, idempotent)
//   node scripts/migrate-groups.mjs --finalize # DROP DEFAULT + SET NOT NULL on rounds.group_id
//
// ORDERING MATTERS. Run without --finalize first, deploy the new code, and only
// then run --finalize. While old code is still live it inserts rounds with no
// group_id; the DEFAULT set here catches those and files them under PMT, which
// is correct. Once the new code (which always stamps group_id explicitly) is
// deployed, --finalize removes the default so that a later import forgetting to
// stamp is a loud constraint violation rather than ~130 Gazelle rounds silently
// becoming PMT rounds and moving every PMT handicap.
//
// Idempotent, additive, and it never deletes a row.
import postgres from 'postgres'
import fs from 'fs'

const finalize = process.argv.includes('--finalize')

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

// --------------------------------------------------------------- structure

await sql`
  CREATE TABLE IF NOT EXISTS groups (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tracks_money BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`

// display_name is NOT NULL rather than a nullable override: every roster read is
// then a plain `pg.display_name` with no COALESCE to forget at eight call sites,
// and in-group uniqueness is actually enforceable. players.name stays canonical.
await sql`
  CREATE TABLE IF NOT EXISTS player_groups (
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    group_id  BIGINT NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (player_id, group_id),
    UNIQUE (group_id, display_name)
  )`
await sql`CREATE INDEX IF NOT EXISTS player_groups_group_idx ON player_groups(group_id)`

await sql`ALTER TABLE rounds      ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES groups(id)`
await sql`ALTER TABLE live_rounds ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES groups(id)`
await sql`CREATE INDEX IF NOT EXISTS rounds_group_date_idx ON rounds(group_id, date DESC)`
await sql`CREATE INDEX IF NOT EXISTS live_rounds_group_status_idx ON live_rounds(group_id, status)`

// ------------------------------------------------------------- seed groups

await sql`
  INSERT INTO groups (slug, name, tracks_money) VALUES
    ('pmt', 'PMT', true),
    ('gazelle', 'Gazelle', false)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, tracks_money = EXCLUDED.tracks_money`

const [pmt] = await sql`SELECT id FROM groups WHERE slug = 'pmt'`
const pmtId = Number(pmt.id)

// A literal default, not a subquery (Postgres won't take one). Catches in-flight
// inserts from the old code between this migration and the deploy.
await sql.unsafe(`ALTER TABLE rounds ALTER COLUMN group_id SET DEFAULT ${pmtId}`)
await sql.unsafe(`ALTER TABLE live_rounds ALTER COLUMN group_id SET DEFAULT ${pmtId}`)

// ---------------------------------------------------------------- backfill

// Every existing player is a PMT member, keeping today's name and admin bit.
// Gazelle memberships are created by the importer, not here, so this migration
// stays purely structural and is safe to re-run.
await sql`
  INSERT INTO player_groups (player_id, group_id, display_name, is_admin)
  SELECT p.id, ${pmtId}, p.name, p.is_admin FROM players p
  ON CONFLICT (player_id, group_id) DO NOTHING`

await sql`UPDATE rounds      SET group_id = ${pmtId} WHERE group_id IS NULL`
await sql`UPDATE live_rounds  SET group_id = ${pmtId} WHERE group_id IS NULL`

// ---------------------------------------------------------------- finalize

if (finalize) {
  const [orphan] = await sql`SELECT COUNT(*) c FROM rounds WHERE group_id IS NULL`
  if (Number(orphan.c) > 0) {
    console.error(`✗ ${orphan.c} rounds still have no group_id — not finalizing`)
    await sql.end()
    process.exit(1)
  }
  await sql`ALTER TABLE rounds ALTER COLUMN group_id DROP DEFAULT`
  await sql`ALTER TABLE rounds ALTER COLUMN group_id SET NOT NULL`
  await sql`ALTER TABLE live_rounds ALTER COLUMN group_id DROP DEFAULT`
  await sql`ALTER TABLE live_rounds ALTER COLUMN group_id SET NOT NULL`
  console.log('✓ rounds.group_id and live_rounds.group_id are now NOT NULL with no default')
}

// ------------------------------------------------------------------ report

console.table(
  (await sql`
    SELECT g.slug, g.name, g.tracks_money,
           (SELECT COUNT(*) FROM player_groups pg WHERE pg.group_id = g.id) AS members,
           (SELECT COUNT(*) FROM player_groups pg WHERE pg.group_id = g.id AND pg.is_admin) AS admins,
           (SELECT COUNT(*) FROM rounds r WHERE r.group_id = g.id) AS rounds
    FROM groups g ORDER BY g.id`).map((r) => ({
    slug: r.slug, name: r.name, money: r.tracks_money,
    members: Number(r.members), admins: Number(r.admins), rounds: Number(r.rounds),
  })),
)
const [nul] = await sql`SELECT COUNT(*) c FROM rounds WHERE group_id IS NULL`
console.log('rounds with no group:', Number(nul.c), finalize ? '' : '— run --finalize after deploying')
await sql.end()
