import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })
const tables = ['players','courses','rounds','round_players','scores']
for (const t of tables) {
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_name = ${t} ORDER BY ordinal_position`
  console.log(`\n== ${t} ==`)
  for (const c of cols) console.log(`  ${c.column_name} ${c.data_type} ${c.is_nullable==='NO'?'NOT NULL':''} ${c.column_default?'DEFAULT '+c.column_default:''}`)
}
// existing hole_scores?
const [hs] = await sql`SELECT to_regclass('public.hole_scores') AS t`
console.log('\nhole_scores exists:', hs.t)
await sql.end()
