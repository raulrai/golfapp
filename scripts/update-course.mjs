import postgres from 'postgres'
import fs from 'fs'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

const before = await sql`SELECT id, name, course_rating, slope_rating FROM courses ORDER BY id`
console.log('BEFORE:', before)

await sql`UPDATE courses SET name = 'Delhi Golf Club — Lodhi (Blue)', course_rating = 70.6, slope_rating = 129 WHERE is_default = true`

const after = await sql`SELECT id, name, course_rating, slope_rating FROM courses ORDER BY id`
console.log('AFTER:', after)

await sql.end()
