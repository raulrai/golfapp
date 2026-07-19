'use client'
import { useState } from 'react'

export type RosterPlayer = { id: number; name: string; handicap: number }

/** Two-step login: pick your name, then your 4-digit PIN (first use sets it). */
export default function LoginSheet({ players, onLoggedIn, onClose }: {
  players: RosterPlayer[]
  onLoggedIn: (playerId: number) => void
  onClose?: () => void
}) {
  const [picked, setPicked] = useState<RosterPlayer | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(pinValue: string) {
    if (!picked || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: Number(picked.id), pin: pinValue }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Login failed')
        setPin('')
      } else {
        onLoggedIn(picked.id)
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }

  function onPinChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    setPin(digits)
    if (digits.length === 4) submit(digits)
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        {!picked ? (
          <>
            <h2>Who are you?</h2>
            {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
              <button key={p.id} onClick={() => { setPicked(p); setPin(''); setError(null) }}>
                <span>{p.name}</span>
                <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>HCP {p.handicap.toFixed(1)}</span>
              </button>
            ))}
          </>
        ) : (
          <>
            <h2>Hi {picked.name}</h2>
            <p className="muted" style={{ margin: '4px 0 12px', fontSize: 14 }}>
              Enter your 4-digit PIN. First time here? The PIN you type now becomes yours.
            </p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              disabled={busy}
              onChange={(e) => onPinChange(e.target.value)}
              placeholder="••••"
              style={{
                width: '100%', boxSizing: 'border-box', background: 'var(--card)',
                border: '1px solid var(--line)', borderRadius: 12, color: 'inherit',
                fontSize: 28, letterSpacing: 12, textAlign: 'center', padding: '12px 0',
                fontFamily: 'inherit',
              }}
            />
            {error && <p className="neg" style={{ margin: '10px 0 0', fontSize: 14 }}>{error}</p>}
            <button className="flat" style={{ marginTop: 12 }} onClick={() => { setPicked(null); setPin(''); setError(null) }}>
              ‹ Not {picked.name}? Pick again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
