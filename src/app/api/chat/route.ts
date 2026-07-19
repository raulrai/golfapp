import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized } from '@/lib/auth'

// Natural-language querying over the golf database.
// The model is given the schema and a single read-only `run_sql` tool; it writes
// Postgres SELECTs, we execute them under a READ ONLY transaction, and it answers
// in plain English. Defence in depth: keyword guard + DB-enforced read-only txn.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.6'
const MAX_STEPS = 6
const MAX_ROWS = 500

const SCHEMA = `
players(id, name)                       -- the golfers
courses(id, name, course_rating, slope_rating, is_default, short, tees, par)
holes(id, course_id, hole, par, stroke_index, yards, tip)   -- one row per hole of a course
rounds(id, date, course_id, handicap_pct, format, stake, team_a bigint[], team_b bigint[])
  -- one row per round played. team_a / team_b are arrays of player ids. format is a text label.
round_players(id, round_id, player_id, stroke_allowance)    -- who played a round + their strokes
scores(id, round_id, player_id, adjusted_gross_score, handicap_score, money_inr, played_at)
  -- one row per player per round.
  -- money_inr  = that player's net winnings for the round in Indian Rupees (can be NEGATIVE = loss).
  -- handicap_score = handicap differential for the round (LOWER is better).
  -- adjusted_gross_score = gross strokes adjusted for max per hole.
hole_scores(id, round_id, player_id, hole, strokes)         -- strokes taken on each hole

Useful relationships:
- Join scores/round_players/hole_scores to players via player_id, to rounds via round_id.
- Net money for a player = SUM(scores.money_inr) for that player_id.
- A player's recent form / handicap is based on scores.handicap_score (lower = better), most recent by played_at.
- Par for a course is courses.par; per-hole par/index is in holes.
`.trim()

function systemPrompt() {
  const today = new Date().toISOString().slice(0, 10)
  return `You are the analyst for a private golf group's stats app. Today is ${today}.
Answer questions about the group's golf data. You have one tool, run_sql, which runs a
read-only Postgres query and returns rows as JSON.

Database schema:
${SCHEMA}

Rules:
- Only SELECT (or WITH ... SELECT) queries. No writes — they will be rejected.
- Prefer a single query; you may call run_sql a few times to refine if needed.
- Always join to players to show names, not raw ids.
- money_inr is in Indian Rupees; format money in answers like ₹12,500 (and note losses as negative).
- Be concise and conversational. Lead with the answer, then any supporting numbers.
- If a query returns nothing, say so plainly rather than guessing.
- Never invent data that isn't in the query results.`
}

type ChatMsg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }

function assertReadOnly(query: string): string {
  const q = query.trim().replace(/;\s*$/, '')
  if (q.includes(';')) throw new Error('Only a single statement is allowed.')
  if (!/^\s*(select|with)\b/i.test(q)) throw new Error('Only SELECT queries are allowed.')
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|copy|merge|call|do|vacuum|reindex|set|lock)\b/i.test(q)) {
    throw new Error('Only read-only SELECT queries are allowed.')
  }
  return q
}

async function runSql(query: string): Promise<{ rows: unknown[]; truncated: boolean }> {
  const clean = assertReadOnly(query)
  const result = await sql.begin(async (tx) => {
    await tx`SET TRANSACTION READ ONLY`
    await tx`SET LOCAL statement_timeout = 8000`
    return await tx.unsafe(clean)
  })
  const rows = result as unknown as unknown[]
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS }
}

const TOOLS = [{
  type: 'function',
  function: {
    name: 'run_sql',
    description: 'Run a single read-only Postgres SELECT query against the golf database and get the rows back as JSON.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A single read-only SELECT (or WITH ... SELECT) statement.' } },
      required: ['query'],
    },
  },
}]

async function callModel(messages: ChatMsg[]) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://golfapp.local',
      'X-Title': 'Golf Tracker',
    },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 500)}`)
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  if ((await sessionPlayerId()) === null) return unauthorized()
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY is not set on the server.' }, { status: 500 })
  }

  const { messages: history } = await req.json() as { messages: { role: 'user' | 'assistant'; content: string }[] }
  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: 'No messages provided.' }, { status: 400 })
  }

  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt() },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ]

  const steps: { query: string; rowCount: number; error?: string }[] = []

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const data = await callModel(messages)
      const msg = data.choices?.[0]?.message
      if (!msg) return NextResponse.json({ error: 'Empty response from model.' }, { status: 502 })

      messages.push(msg)
      const toolCalls = msg.tool_calls as { id: string; function: { name: string; arguments: string } }[] | undefined

      if (!toolCalls || toolCalls.length === 0) {
        return NextResponse.json({ answer: msg.content ?? '', steps })
      }

      for (const call of toolCalls) {
        let toolContent: string
        try {
          const args = JSON.parse(call.function.arguments || '{}')
          const { rows, truncated } = await runSql(args.query)
          steps.push({ query: args.query, rowCount: rows.length })
          toolContent = JSON.stringify({ rows, truncated })
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          try {
            const args = JSON.parse(call.function.arguments || '{}')
            steps.push({ query: args.query ?? '', rowCount: 0, error: message })
          } catch { /* ignore */ }
          toolContent = JSON.stringify({ error: message })
        }
        messages.push({ role: 'tool', tool_call_id: call.id, name: 'run_sql', content: toolContent })
      }
    }
    return NextResponse.json({ answer: "I couldn't finish working that out in a few steps — try narrowing the question.", steps })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message, steps }, { status: 502 })
  }
}
