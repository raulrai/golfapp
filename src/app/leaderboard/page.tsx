'use client'
import { useEffect, useState } from 'react'

type Player = { id: number; name: string; handicap: number; money: number; rounds: number }

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([])
  const [myId, setMyId] = useState<number | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('golf_player_id')
    if (id) setMyId(Number(id))
    fetch('/api/leaderboard').then(r => r.json()).then(data => setPlayers(data.byMoney))
  }, [])

  const total = players.reduce((s, p) => s + Math.abs(p.money), 0)

  return (
    <div className="screen">
      <div className="topbar">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1>Order of Merit</h1>
        <div className="sub">Total in play · ₹{total.toLocaleString('en-IN')}</div>
      </div>

      <div className="stack">
        {players.map((p, i) => {
          const isMe = p.id === myId
          const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''
          return (
            <div key={p.id} className={`rowcard ${isMe ? 'me' : ''}`}>
              <div className={`rank ${rankCls}`}>{i === 0 ? '🏅' : i + 1}</div>
              <div style={{ flex: 1 }}>
                <div className="rname">{p.name}{isMe ? ' · you' : ''}</div>
                <div className="rsub">HCP {p.handicap.toFixed(1)} · {p.rounds} rounds</div>
              </div>
              <div className={`rval ${p.money >= 0 ? 'pos' : 'neg'}`}>
                {p.money >= 0 ? '+' : '−'}₹{Math.abs(p.money).toLocaleString('en-IN')}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
