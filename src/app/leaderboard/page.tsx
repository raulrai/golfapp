'use client'
import { useEffect, useState } from 'react'
import BottomNav from '@/components/BottomNav'

type Player = { id: number; name: string; handicap: number; money: number; rounds: number }

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([])
  const [myId, setMyId] = useState<number | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('golf_player_id')
    if (id) setMyId(Number(id))
    fetch('/api/leaderboard').then(r => r.json()).then(data => setPlayers(data.byMoney))
  }, [])

  const total = players.reduce((s, p) => s + p.money, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 80 }}>
      <div style={{ background: 'var(--green)', padding: '52px 24px 24px' }}>
        <h1 style={{ color: 'white', fontSize: 24, fontWeight: 800, margin: 0 }}>Order of Merit</h1>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>Total in play: ₹{Math.abs(total).toLocaleString('en-IN')}</div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {players.map((p, i) => {
          const isMe = p.id === myId
          return (
            <div key={p.id} style={{
              background: isMe ? '#f0f9f4' : 'white',
              border: `2px solid ${isMe ? 'var(--green)' : '#f3f4f6'}`,
              borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: p.money > 0 ? (i === 0 ? '#C9A84C' : '#dcfce7') : p.money < 0 ? '#fee2e2' : '#f3f4f6',
                color: p.money > 0 ? (i === 0 ? 'white' : 'var(--positive)') : p.money < 0 ? 'var(--negative)' : 'var(--muted)',
                fontWeight: 800, fontSize: 13,
              }}>
                {i === 0 ? '🏅' : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: isMe ? 'var(--green)' : 'var(--text)' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>HCP {p.handicap.toFixed(1)} · {p.rounds} rounds</div>
              </div>
              <div style={{
                fontSize: 18, fontWeight: 800,
                color: p.money >= 0 ? 'var(--positive)' : 'var(--negative)',
              }}>
                {p.money >= 0 ? '+' : ''}₹{Math.abs(p.money).toLocaleString('en-IN')}
              </div>
            </div>
          )
        })}
      </div>
      <BottomNav />
    </div>
  )
}
