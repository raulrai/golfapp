'use client'
import { useState } from 'react'
import { saveLiveRoundId } from '@/lib/useLiveRound'
import { saveGame } from '@/lib/golf/game'

export type GroupOption = { slug: string; name: string; tracksMoney: boolean }

/** Switch the active group. No PIN — one human has one PIN across both groups,
 *  so this is a view change, not a re-authentication. */
export default function GroupSwitcherSheet({ groups, current, onSwitched, onClose }: {
  groups: GroupOption[]
  current: string | null
  onSwitched: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(slug: string) {
    if (busy || slug === current) return onClose()
    setBusy(true)
    try {
      const res = await fetch('/api/auth/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (!res.ok) {
        setError((await res.json()).error ?? 'Could not switch group')
        setBusy(false)
        return
      }
      // A live round belongs to the group it was started in. Carrying its id
      // across a switch leaves the new session polling a round it can no longer
      // read — a 403 loop, and one that only bites dual-group players mid-round.
      saveLiveRoundId(null)
      saveGame(null)
      onSwitched()
    } catch {
      setError('Network error — try again')
      setBusy(false)
    }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h2>Switch group</h2>
        {groups.map(g => (
          <button key={g.slug} onClick={() => pick(g.slug)} disabled={busy}>
            <span>{g.name}</span>
            {g.slug === current && <span className="gold-text" style={{ fontSize: 14 }}>current</span>}
          </button>
        ))}
        {error && <p className="neg" style={{ margin: '10px 0 0', fontSize: 14 }}>{error}</p>}
      </div>
    </div>
  )
}
