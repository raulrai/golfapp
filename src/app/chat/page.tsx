'use client'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Step = { query: string; rowCount: number; error?: string }
type Msg = { role: 'user' | 'assistant'; content: string; steps?: Step[] }
type Conversation = { id: string; title: string; updatedAt: number; messages: Msg[] }

const STORAGE_KEY = 'golf_chat_conversations'
const MAX_CONVERSATIONS = 5

const SUGGESTIONS = [
  "Who's up the most money overall?",
  'Who has the lowest handicap right now?',
  'Show the order of merit this year',
  'Who has played the most rounds?',
]

function newId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random())
}
function blankConversation(): Conversation {
  return { id: newId(), title: 'New chat', updatedAt: Date.now(), messages: [] }
}
function deriveTitle(text: string) {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 42 ? t.slice(0, 42) + '…' : t
}
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); return d === 1 ? 'yesterday' : `${d}d ago`
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string>('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const current = conversations.find(c => c.id === currentId)
  const messages = current?.messages ?? []
  const saved = conversations.filter(c => c.messages.length > 0)

  // Load persisted conversations on mount (survives tab navigation + reloads).
  // localStorage is client-only, so this must run in an effect rather than during
  // render — otherwise SSR/hydration would mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let convos: Conversation[] = []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) convos = JSON.parse(raw)
    } catch { convos = [] }
    if (convos.length > 0) {
      setConversations(convos)
      setCurrentId(convos[0].id)
    } else {
      const fresh = blankConversation()
      setConversations([fresh])
      setCurrentId(fresh.id)
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, loading])

  function persist(convos: Conversation[]) {
    try {
      const keep = convos.filter(c => c.messages.length > 0).slice(0, MAX_CONVERSATIONS)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keep))
    } catch { /* storage full or unavailable — ignore */ }
  }

  // Update the current conversation, move it to the front, cap to MAX, and persist.
  function updateCurrent(updater: (c: Conversation) => Conversation) {
    setConversations(prev => {
      const cur = prev.find(c => c.id === currentId)
      if (!cur) return prev
      const updated = updater(cur)
      const ordered = [updated, ...prev.filter(c => c.id !== currentId)].slice(0, MAX_CONVERSATIONS)
      persist(ordered)
      return ordered
    })
  }

  function newChat() {
    const fresh = blankConversation()
    setConversations(prev => [fresh, ...prev].slice(0, MAX_CONVERSATIONS))
    setCurrentId(fresh.id)
    setShowHistory(false)
    setError(null)
  }

  async function send(text: string) {
    const q = text.trim()
    if (!q || loading || !currentId) return
    setError(null)
    setInput('')
    const userMsg: Msg = { role: 'user', content: q }
    const history = [...messages, userMsg]
    updateCurrent(c => ({
      ...c,
      title: c.messages.length === 0 ? deriveTitle(q) : c.title,
      messages: [...c.messages, userMsg],
      updatedAt: Date.now(),
    }))
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
      } else {
        updateCurrent(c => ({
          ...c,
          messages: [...c.messages, { role: 'assistant', content: data.answer, steps: data.steps }],
          updatedAt: Date.now(),
        }))
      }
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="crest">⛳ Ask the Caddie ⛳</div>
          <h1>Ask</h1>
          <div className="sub">Questions about scores, money &amp; handicaps</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="chat-chip" onClick={newChat}>＋ New</button>
          <button className="chat-chip" onClick={() => setShowHistory(true)}>Recent</button>
        </div>
      </div>

      <div ref={scrollRef} className="stack" style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {messages.length === 0 && (
          <div className="panel">
            <div className="panel-head"><span className="lbl">Try asking</span></div>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} style={{
                width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--line)', color: 'var(--ink)', fontSize: 15,
                padding: '11px 0', cursor: 'pointer', fontFamily: 'inherit',
              }}>{s}</button>
            ))}
          </div>
        )}

        {messages.map((m, i) => <Bubble key={i} msg={m} />)}

        {loading && (
          <div style={bubbleStyle(false)}>
            <span className="muted" style={{ fontSize: 14 }}>Thinking…</span>
          </div>
        )}

        {error && (
          <div style={{ ...bubbleStyle(false), borderColor: 'var(--neg)', color: 'var(--neg)' }}>{error}</div>
        )}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(input) }}
        style={{
          position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 62px)',
          left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480,
          padding: '8px 16px', display: 'flex', gap: 8, zIndex: 30,
          background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about the group's golf…"
          className="edit-input"
          style={{ flex: 1, textAlign: 'left' }}
        />
        <button type="submit" disabled={loading || !input.trim()} style={{
          flex: '0 0 auto', background: 'var(--gold)', border: 'none', borderRadius: 10,
          color: '#1a1206', fontWeight: 800, fontSize: 15, padding: '0 18px', cursor: 'pointer',
          fontFamily: 'inherit', opacity: loading || !input.trim() ? 0.45 : 1,
        }}>Ask</button>
      </form>

      {showHistory && (
        <div className="sheet-bg" onClick={() => setShowHistory(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="grip" />
            <h2>Recent chats</h2>
            <button className="primary" onClick={newChat}>＋ New chat</button>
            <div style={{ height: 10 }} />
            {saved.length === 0 && <div className="result-note">No saved chats yet.</div>}
            {saved.map(c => (
              <button
                key={c.id}
                className={c.id === currentId ? 'on' : ''}
                onClick={() => { setCurrentId(c.id); setShowHistory(false); setError(null) }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                  {c.title}
                </span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 400, flexShrink: 0, marginLeft: 10 }}>
                  {timeAgo(c.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Bubble({ msg }: { msg: Msg }) {
  const [showSql, setShowSql] = useState(false)
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={bubbleStyle(isUser)}>
        {isUser
          ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.5 }}>{msg.content}</div>
          : <div className="chat-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>}
        {!isUser && msg.steps && msg.steps.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setShowSql(s => !s)} style={{
              background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit', padding: 0, letterSpacing: 0.5,
            }}>{showSql ? 'Hide' : 'Show'} SQL ({msg.steps.length})</button>
            {showSql && msg.steps.map((s, i) => (
              <pre key={i} style={{
                marginTop: 6, background: 'var(--board)', border: '1px solid var(--line)',
                borderRadius: 8, padding: 8, fontSize: 11, color: s.error ? 'var(--neg)' : 'var(--muted)',
                whiteSpace: 'pre-wrap', overflowX: 'auto',
              }}>{s.query}{s.error ? `\n-- error: ${s.error}` : `\n-- ${s.rowCount} row(s)`}</pre>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function bubbleStyle(isUser: boolean): React.CSSProperties {
  return {
    maxWidth: '90%',
    background: isUser ? 'var(--gold)' : 'var(--card)',
    color: isUser ? '#1a1206' : 'var(--ink)',
    border: isUser ? 'none' : '1px solid var(--line)',
    borderRadius: 14,
    padding: '11px 14px',
    fontWeight: isUser ? 600 : 400,
  }
}
