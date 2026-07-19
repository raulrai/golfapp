'use client'
import { useState } from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--card)',
  border: '1px solid var(--line)', borderRadius: 12, color: 'inherit',
  fontSize: 22, textAlign: 'center', padding: '10px 0', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: 1,
  textTransform: 'uppercase', color: 'var(--muted)', margin: '14px 0 6px',
}

/** Enter a round you played on your own: gross total + optional winnings.
 *  Saves as a 1-player total-mode round — updates handicap (and money if given).
 *  Admins get a picker and can file the round for any player. */
export default function SoloRoundSheet({ player, roster, onSaved, onClose }: {
  player: { id: number; name: string }
  /** When set (admin only), the score can be entered for any of these players. */
  roster?: { id: number; name: string }[]
  onSaved: (roundId: number) => void
  onClose: () => void
}) {
  const [forId, setForId] = useState(player.id)
  const [gross, setGross] = useState('')
  const [money, setMoney] = useState('')
  const [lost, setLost] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const grossNum = /^\d+$/.test(gross) ? Number(gross) : null
  const moneyNum = money === '' ? null : Number(money) * (lost ? -1 : 1)

  async function save() {
    if (grossNum === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/play-rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          scoringMode: 'total',
          players: [{ id: forId, strokes: 0 }],
          scores: { 0: { [forId]: grossNum } },
          money: moneyNum === null ? {} : { [forId]: moneyNum },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
      } else {
        onSaved(Number(data.round_id))
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h2>{roster ? 'Enter a score' : `Solo round · ${player.name}`}</h2>
        <p className="muted" style={{ margin: '4px 0 2px', fontSize: 14, textAlign: 'center' }}>
          {roster ? 'As admin you can file this for any player.' : 'Your 18-hole gross counts towards your handicap. Winnings are optional.'}
        </p>

        {roster && (
          <>
            <label style={labelStyle}>Player</label>
            <select
              value={forId}
              disabled={busy}
              onChange={(e) => setForId(Number(e.target.value))}
              style={{ ...inputStyle, fontSize: 16, padding: '12px 8px', textAlign: 'center' }}
            >
              {[...roster].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.id === player.id ? ' (me)' : ''}</option>
              ))}
            </select>
          </>
        )}

        <label style={labelStyle}>Gross score</label>
        <input
          autoFocus
          inputMode="numeric"
          placeholder="e.g. 88"
          value={gross}
          disabled={busy}
          onChange={(e) => setGross(e.target.value.replace(/\D/g, '').slice(0, 3))}
          style={inputStyle}
        />

        <label style={labelStyle}>Winnings ₹ (optional)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`sign-toggle ${lost ? 'neg' : 'pos'}`}
            aria-label="Toggle won / lost"
            disabled={busy}
            onClick={() => setLost((v) => !v)}
            style={{
              width: 52, flex: 'none', background: 'var(--card)', border: '1px solid var(--line)',
              borderRadius: 12, fontSize: 22, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {lost ? '−' : '+'}
          </button>
          <input
            inputMode="numeric"
            placeholder="leave blank if none"
            value={money}
            disabled={busy}
            onChange={(e) => setMoney(e.target.value.replace(/\D/g, ''))}
            style={{ ...inputStyle, textAlign: 'center' }}
          />
        </div>

        <label style={labelStyle}>Date</label>
        <input
          type="date"
          value={date}
          disabled={busy}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => setDate(e.target.value)}
          style={{ ...inputStyle, fontSize: 16, padding: '12px 0' }}
        />

        {error && <p className="neg" style={{ margin: '10px 0 0', fontSize: 14 }}>{error}</p>}

        <button
          className="primary"
          style={{ marginTop: 16, justifyContent: 'center' }}
          disabled={grossNum === null || busy}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save Round'}
        </button>
        <button className="flat" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}
