'use client'
import { useEffect, useState } from 'react'
import BottomNav from '@/components/BottomNav'

type Player = { id: number; name: string; handicap: number; money: number; rounds: number }

export default function Handicaps() {
  const [players, setPlayers] = useState<Player[]>([])
  const [myId, setMyId] = useState<number | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('golf_player_id')
    if (id) setMyId(Number(id))
    fetch('/api/leaderboard').then(r => r.json()).then(data => setPlayers(data.byHandicap))
  }, [])

  return (
    <div className="screen">
      <div className="topbar">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1>Handicap Rankings</h1>
        <div className="sub">Best 6 of last 12 rounds</div>
      </div>

      <div className="stack">
        {players.map((p, i) => {
          const isMe = p.id === myId
          const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''
          return (
            <div key={p.id} className={`rowcard ${isMe ? 'me' : ''}`}>
              <div className={`rank ${rankCls}`}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div className="rname">{p.name}{isMe ? ' · you' : ''}</div>
                <div className="rsub">{p.rounds} rounds</div>
              </div>
              <div className="rval gold-text">{p.handicap.toFixed(1)}</div>
            </div>
          )
        })}
      </div>
      <BottomNav />
    </div>
  )
}
