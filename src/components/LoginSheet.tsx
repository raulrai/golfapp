'use client'
import { useEffect, useState } from 'react'

export type RosterPlayer = { id: number; name: string; hasPin?: boolean }
type GroupOption = { slug: string; name: string }

/**
 * Three-step login: pick your group, pick your name, enter your PIN.
 *
 * The group step comes first because the roster is group-scoped — you can only
 * log in as a name that belongs to the group you picked. It is skipped when a
 * group is already selected (a returning user with a golf_group cookie, or a
 * logged-in player switching accounts within their group).
 *
 * The roster here comes from the public /api/groups/[slug]/roster endpoint,
 * which carries names and nothing else — no handicaps, no money.
 */
export default function LoginSheet({ initialGroup, onLoggedIn, onClose }: {
  initialGroup?: string | null
  onLoggedIn: (playerId: number) => void
  onClose?: () => void
}) {
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [group, setGroup] = useState<string | null>(initialGroup ?? null)
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null)
  const [picked, setPicked] = useState<RosterPlayer | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (group) return
    fetch('/api/groups').then(r => r.json()).then(setGroups).catch(() => setError('Could not load groups'))
  }, [group])

  // Keyed by group so a slow response for the group you just navigated away from
  // can't land in the list you're now looking at.
  useEffect(() => {
    if (!group) return
    let live = true
    fetch(`/api/groups/${group}/roster`)
      .then(r => r.json())
      .then((d: { players: RosterPlayer[] }) => { if (live) setPlayers(d.players ?? []) })
      .catch(() => { if (live) setError('Could not load the roster') })
    return () => { live = false }
  }, [group])

  async function submit(pinValue: string) {
    if (!picked || !group || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: Number(picked.id), pin: pinValue, groupSlug: group }),
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

  const groupName = groups.find(g => g.slug === group)?.name ?? group

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />

        {!group ? (
          <>
            <h2>Which group?</h2>
            {groups.map(g => (
              <button key={g.slug} onClick={() => { setGroup(g.slug); setError(null) }}>
                <span>{g.name}</span>
                <span className="muted" style={{ fontSize: 20, fontWeight: 400 }}>›</span>
              </button>
            ))}
            {error && <p className="neg" style={{ margin: '10px 0 0', fontSize: 14 }}>{error}</p>}
          </>
        ) : !picked ? (
          <>
            <h2>Who are you?</h2>
            <p className="muted" style={{ margin: '4px 0 12px', fontSize: 14 }}>{groupName}</p>
            {players === null
              ? <p className="muted" style={{ fontSize: 14 }}>Loading…</p>
              : players.map(p => (
                  <button key={p.id} onClick={() => { setPicked(p); setPin(''); setError(null) }}>
                    <span>{p.name}</span>
                  </button>
                ))}
            {!initialGroup && (
              <button className="flat" style={{ marginTop: 12 }}
                onClick={() => { setPlayers(null); setGroup(null); setError(null) }}>
                ‹ Not {groupName}? Pick another group
              </button>
            )}
          </>
        ) : (
          <>
            <h2>Hi {picked.name}</h2>
            <p className="muted" style={{ margin: '4px 0 12px', fontSize: 14 }}>
              {picked.hasPin
                ? 'Enter your 4-digit PIN.'
                : 'Enter your 4-digit PIN. First time here? The PIN you type now becomes yours.'}
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
