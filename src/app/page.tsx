'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

type Player = { id: number; name: string; handicap: number; money: number }

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([])
  const [myId, setMyId] = useState<number | null>(null)
  const [me, setMe] = useState<Player | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    fetch('/api/players').then(r => r.json()).then((data: Player[]) => {
      setPlayers(data)
      const saved = localStorage.getItem('golf_player_id')
      if (saved) {
        const id = Number(saved)
        setMyId(id)
        setMe(data.find(p => p.id === id) ?? null)
      } else {
        setShowPicker(true)
      }
    })
  }, [])

  function selectPlayer(p: Player) {
    localStorage.setItem('golf_player_id', String(p.id))
    setMyId(p.id)
    setMe(p)
    setShowPicker(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'var(--green)', padding: '52px 24px 32px' }}>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 6 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ color: 'white', fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              {me ? `Hello, ${me.name}` : 'Golf Tracker'}
            </h1>
            {me && (
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, marginTop: 4 }}>
                Handicap {me.handicap.toFixed(1)} · {me.money >= 0 ? '+' : ''}₹{me.money.toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <button onClick={() => setShowPicker(true)} style={{
            background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 10,
            color: 'white', fontSize: 13, fontWeight: 600, padding: '7px 14px', cursor: 'pointer',
          }}>
            {me ? 'Switch' : 'Who am I?'}
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {me && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StatCard label="Handicap" value={me.handicap.toFixed(1)} sub="current index" accent="var(--green)" />
            <StatCard
              label="Order of Merit"
              value={(me.money >= 0 ? '+' : '') + '₹' + Math.abs(me.money).toLocaleString('en-IN')}
              sub="total winnings"
              accent={me.money >= 0 ? 'var(--positive)' : 'var(--negative)'}
            />
          </div>
        )}

        <Link href="/setup-round" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--green)', borderRadius: 16, padding: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(27,67,50,0.25)',
          }}>
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>⛳</div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>Set Up a Round</div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 }}>Select players · get stroke allowances</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 28 }}>›</div>
          </div>
        </Link>

        <Link href="/enter-score" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: '2px solid var(--green)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>✏️</div>
              <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 17 }}>Enter My Score</div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Log gross score · money won/lost</div>
            </div>
            <div style={{ color: 'rgba(27,67,50,0.3)', fontSize: 28 }}>›</div>
          </div>
        </Link>

        <QuickLeaderboard />
      </div>

      {showPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50,
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
            maxHeight: '80vh', overflow: 'auto', padding: '24px 16px 48px', margin: '0 auto',
          }}>
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 4, margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16, textAlign: 'center', color: 'var(--green)' }}>Who are you?</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {players.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                <button key={p.id} onClick={() => selectPlayer(p)} style={{
                  background: myId === p.id ? 'var(--green-pale, #f0f9f4)' : 'white',
                  border: `2px solid ${myId === p.id ? 'var(--green)' : '#e5e7eb'}`,
                  borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>HCP {p.handicap.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function QuickLeaderboard() {
  const [data, setData] = useState<{ byMoney: { name: string; money: number }[] } | null>(null)
  useEffect(() => { fetch('/api/leaderboard').then(r => r.json()).then(setData) }, [])
  if (!data) return null
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Order of Merit</span>
        <Link href="/leaderboard" style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600, textDecoration: 'none' }}>All →</Link>
      </div>
      {data.byMoney.slice(0, 5).map((p, i) => (
        <div key={p.name} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '9px 0', borderBottom: i < 4 ? '1px solid #f3f4f6' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? '#C9A84C' : 'var(--muted)', width: 18, textAlign: 'center' }}>
              {i === 0 ? '🏅' : i + 1}
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: p.money >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
            {p.money >= 0 ? '+' : ''}₹{Math.abs(p.money).toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  )
}
