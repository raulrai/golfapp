import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _sql: postgres.Sql | undefined
}

function createSql() {
  return postgres(process.env.DATABASE_URL!, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required for Supabase connection pooler
  })
}

const sql: postgres.Sql = global._sql ?? createSql()
if (process.env.NODE_ENV !== 'production') global._sql = sql

export default sql
