'use client'
import { useCallback, useEffect, useState } from 'react'
import BottomNav from '@/components/BottomNav'

type Score = { round_id: number; handicap_score: number; played_at: string; money_inr: number; adjusted_gross_score: number | null; course_name: string | null }
type Player = { id: number; name: string; handicap: number; money: number; scores: Score[] }

type EditRow = { player_id: number; player_name: string; gross: string; money: string }
type RoundDetail = {
  date: string
  course_name: string | null
  scores: { player_id: number; player_name: string; adjusted_gross_score: number | null; money_inr: number }[]
}

export default function History() {
  const [me, setMe] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)

  const load = useCallback(() => {
    const id = localStorage.getItem('golf_player_id')
    if (!id) { setLoading(false); return }
    return fetch(`/api/players/${id}`).then(r => r.json()).then(data => {
      setMe(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="screen"><div className="empty"><div className="muted">Loading…</div></div></div>
  )

  if (!me) return (
    <div className="screen">
      <div className="empty">
        <div className="big">🏌️</div>
        <div className="rname">Select your player first</div>
        <div className="muted">Go to Home and tap “Who am I?”</div>
      </div>
      <BottomNav />
    </div>
  )

  return (
    <div className="screen">
      <div className="topbar">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1>{me.name}&apos;s History</h1>
        <div className="sub">
          {me.scores.length} rounds · HCP {me.handicap.toFixed(1)} · {me.money >= 0 ? '+' : '−'}₹{Math.abs(me.money).toLocaleString('en-IN')}
        </div>
      </div>

      <div className="stack">
        {me.scores.map((s, i) => {
          const isInHandicap = i < 12
          return (
            <div key={i} className="rowcard" style={{ opacity: isInHandicap ? 1 : 0.55 }}>
              <div style={{ flex: 1 }}>
                <div className="rname" style={{ fontSize: 14 }}>
                  {new Date(s.played_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <div className="rsub">
                  {s.course_name ?? 'Delhi Golf Club'}
                  {s.adjusted_gross_score ? ` · Gross ${s.adjusted_gross_score}` : ''}
                  {isInHandicap ? '' : ' · not counted'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div className="rval sm gold-text">
                  {s.handicap_score >= 0 ? '+' : ''}{s.handicap_score.toFixed(1)}
                </div>
                {s.money_inr !== 0 && (
                  <div className={`rsub ${s.money_inr >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                    {s.money_inr >= 0 ? '+' : '−'}₹{Math.abs(s.money_inr).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
              <button className="edit-btn" onClick={() => setEditId(s.round_id)}>Edit</button>
            </div>
          )
        })}
      </div>

      {editId !== null && (
        <EditSheet
          roundId={editId}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); load() }}
        />
      )}

      <BottomNav />
    </div>
  )
}

function EditSheet({ roundId, onClose, onSaved }: { roundId: number; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<RoundDetail | null>(null)
  const [rows, setRows] = useState<EditRow[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/rounds/${roundId}`).then(r => r.json()).then((d: RoundDetail) => {
      setDetail(d)
      setRows(d.scores.map(s => ({
        player_id: s.player_id,
        player_name: s.player_name,
        gross: s.adjusted_gross_score != null ? String(s.adjusted_gross_score) : '',
        money: s.money_inr ? String(s.money_inr) : '',
      })))
    }).catch(() => setErr('Could not load round'))
  }, [roundId])

  const setRow = (pid: number, key: 'gross' | 'money', val: string) =>
    setRows(rs => rs.map(r => r.player_id === pid ? { ...r, [key]: val } : r))

  const moneyBalance = rows.reduce((acc, r) => acc + (Number(r.money) || 0), 0)
  const valid = rows.length > 0 && rows.every(r => r.gross.trim() !== '' && Number.isFinite(Number(r.gross)) && Number(r.gross) > 0)

  const save = async () => {
    setSaving(true); setErr('')
    try {
      for (const r of rows) {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            round_id: roundId,
            player_id: r.player_id,
            adjusted_gross_score: Number(r.gross),
            money_inr: Number(r.money) || 0,
          }),
        })
        if (!res.ok) throw new Error('save failed')
      }
      onSaved()
    } catch {
      setErr('Save failed — please try again')
      setSaving(false)
    }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="grip" />
        <h2>Edit round</h2>
        {!detail ? (
          <div className="muted" style={{ textAlign: 'center', padding: '12px 0' }}>{err || 'Loading…'}</div>
        ) : (
          <>
            <div className="edit-sub">
              {new Date(detail.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{detail.course_name ?? 'Delhi Golf Club'}
            </div>
            {rows.map(r => (
              <div className="edit-row" key={r.player_id}>
                <div className="edit-name">{r.player_name}</div>
                <div className="edit-fields">
                  <label className="edit-field">
                    <span>Gross</span>
                    <input
                      className="edit-input" inputMode="numeric" value={r.gross}
                      onChange={e => setRow(r.player_id, 'gross', e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </label>
                  <label className="edit-field">
                    <span>Money ₹</span>
                    <input
                      className="edit-input" inputMode="numeric" placeholder="±" value={r.money}
                      onChange={e => setRow(r.player_id, 'money', e.target.value.replace(/[^0-9-]/g, ''))}
                    />
                  </label>
                </div>
              </div>
            ))}
            <div className={`pot-line ${moneyBalance === 0 ? 'ok' : 'off'}`}>
              Money balance: {moneyBalance === 0 ? 'level ✓' : `${moneyBalance > 0 ? '+' : '−'}₹${Math.abs(moneyBalance).toLocaleString('en-IN')} (should net to zero)`}
            </div>
            {err && <div className="pot-line off">{err}</div>}
            <button className="primary" disabled={!valid || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className="flat" onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
