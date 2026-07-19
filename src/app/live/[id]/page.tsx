'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import '../../play/play.css'
import Scorecard from '@/components/Scorecard'
import MatchBar from '@/components/MatchBar'
import { useLiveRound, saveLiveRoundId } from '@/lib/useLiveRound'

/** Spectator view of one live round. Read-only — score writes are
 *  member-gated server-side; members get a shortcut into /play. */
export default function LiveRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const live = useLiveRound(Number(id))
  const [myId, setMyId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { playerId: number } | null) => { if (d) setMyId(d.playerId) })
      .catch(() => { /* spectating works logged-out only until the API says 401 */ })
  }, [])

  const g = live.game
  const isMember = g !== null && myId !== null && g.players.some((p) => Number(p.id) === myId)

  return (
    <div className="play">
      <header className="play-head">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1 className="serif">Live Round</h1>
        <div className="sub">
          {live.status === 'live' ? '● watching live' :
           live.status === 'finished' ? 'round saved' :
           live.status === 'discarded' ? 'round discarded' :
           live.status === 'gone' ? 'round not found' : 'loading…'}
        </div>
      </header>

      {!g ? null : (
        <>
          {isMember && live.status === 'live' && (
            <Link
              href="/play"
              className="cta"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 12 }}
              onClick={() => saveLiveRoundId(Number(id))}
            >
              Score this round →
            </Link>
          )}
          <Scorecard game={g} />
          {g.scoringMode === 'hole' && <MatchBar game={g} />}
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <Link href="/live" className="cta ghost" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          ‹ All live rounds
        </Link>
      </div>
    </div>
  )
}
