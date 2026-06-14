// Idempotent migration: add course meta columns + a `holes` table, then seed
// the default course's hole-by-hole data from the canonical course.ts constant.
//   node scripts/migrate-course-holes.mjs
import postgres from 'postgres'
import fs from 'fs'
import { DELHI_LODHI_BLUE } from '../src/lib/golf/course.ts'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

// 1. extend courses with the display/meta fields that only lived in course.ts
await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS short text`
await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS tees text`
await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS par smallint`

// 2. per-hole table
await sql`
  CREATE TABLE IF NOT EXISTS holes (
    id bigserial PRIMARY KEY,
    course_id bigint NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    hole smallint NOT NULL,
    par smallint NOT NULL,
    stroke_index smallint NOT NULL,
    yards integer,
    tip text,
    UNIQUE (course_id, hole)
  )`
await sql`CREATE INDEX IF NOT EXISTS holes_course_idx ON holes(course_id)`

// 3. seed the default course meta + holes from the canonical constant
const [course] = await sql`SELECT id FROM courses WHERE is_default = true LIMIT 1`
if (!course) throw new Error('No default course to seed — run update-course first')
const c = DELHI_LODHI_BLUE
await sql`
  UPDATE courses
  SET name = ${c.name}, short = ${c.short}, tees = ${c.tees}, par = ${c.par},
      course_rating = ${c.rating}, slope_rating = ${c.slope}
  WHERE id = ${course.id}`

for (const h of c.holes) {
  await sql`
    INSERT INTO holes (course_id, hole, par, stroke_index, yards, tip)
    VALUES (${course.id}, ${h.n}, ${h.par}, ${h.si}, ${h.yards}, ${h.tip})
    ON CONFLICT (course_id, hole)
    DO UPDATE SET par = EXCLUDED.par, stroke_index = EXCLUDED.stroke_index,
                  yards = EXCLUDED.yards, tip = EXCLUDED.tip`
}

const [{ count }] = await sql`SELECT count(*)::int FROM holes WHERE course_id = ${course.id}`
console.log(`course ${course.id} seeded with ${count} holes`)
await sql.end()
