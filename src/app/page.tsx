'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

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
    <div className="screen">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="crest">⛳ Delhi Golf Club ⛳</div>
          <h1>{me ? `Hello, ${me.name}` : 'Golf Tracker'}</h1>
          <div className="sub">
            {me
              ? <>Handicap {me.handicap.toFixed(1)} · <span className={me.money >= 0 ? 'pos' : 'neg'}>{me.money >= 0 ? '+' : '−'}₹{Math.abs(me.money).toLocaleString('en-IN')}</span></>
              : new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <button onClick={() => setShowPicker(true)} style={{
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10,
          color: 'var(--gold)', fontSize: 13, fontWeight: 600, padding: '7px 14px', cursor: 'pointer',
          fontFamily: 'inherit', marginTop: 8,
        }}>
          {me ? 'Switch' : 'Who am I?'}
        </button>
      </div>

      <div className="stack">
        {me && (
          <div className="statgrid">
            <div className="stat">
              <div className="label">Handicap</div>
              <div className="value gold-text">{me.handicap.toFixed(1)}</div>
              <div className="sub">current index</div>
            </div>
            <div className="stat">
              <div className="label">Order of Merit</div>
              <div className={`value ${me.money >= 0 ? 'pos' : 'neg'}`}>
                {me.money >= 0 ? '+' : '−'}₹{Math.abs(me.money).toLocaleString('en-IN')}
              </div>
              <div className="sub">total winnings</div>
            </div>
          </div>
        )}

        <Link href="/play" className="cta-card">
          <div>
            <div style={{ fontSize: 22, marginBottom: 4 }}>⛳</div>
            <div className="ttl">Play a Round</div>
            <div className="desc">Live match play · Auto Press · hole-by-hole</div>
          </div>
          <div className="chev">›</div>
        </Link>

        <QuickLeaderboard />
      </div>

      {showPicker && (
        <div className="sheet-bg">
          <div className="sheet">
            <div className="grip" />
            <h2>Who are you?</h2>
            {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
              <button key={p.id} className={myId === p.id ? 'on' : ''} onClick={() => selectPlayer(p)}>
                <span>{p.name}</span>
                <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>HCP {p.handicap.toFixed(1)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickLeaderboard() {
  const [data, setData] = useState<{ byMoney: { name: string; money: number }[] } | null>(null)
  useEffect(() => { fetch('/api/leaderboard').then(r => r.json()).then(setData) }, [])
  if (!data) return null
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="lbl">Order of Merit</span>
        <Link href="/leaderboard">All →</Link>
      </div>
      {data.byMoney.slice(0, 5).map((p, i) => (
        <div key={p.name} className="panel-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={i === 0 ? 'gold-text' : 'muted'} style={{ fontSize: 12, fontWeight: 700, width: 18, textAlign: 'center' }}>
              {i === 0 ? '🏅' : i + 1}
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
          </div>
          <span className={p.money >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
            {p.money >= 0 ? '+' : '−'}₹{Math.abs(p.money).toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  )
}
