'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import LoginSheet from '@/components/LoginSheet'
import SoloRoundSheet from '@/components/SoloRoundSheet'
import GroupSwitcherSheet from '@/components/GroupSwitcherSheet'
import type { GroupOption } from '@/components/GroupSwitcherSheet'

type Player = { id: number; name: string; handicap: number; money: number }
type Session = {
  playerId: number
  displayName: string
  isAdmin?: boolean
  group: GroupOption | null
  groups: GroupOption[]
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Player | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showSolo, setShowSolo] = useState(false)
  const [soloSaved, setSoloSaved] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const amAdmin = session?.isAdmin === true
  const tracksMoney = session?.group?.tracksMoney === true

  useEffect(() => {
    // Session first: /api/players is now group-scoped and requires auth, so
    // there is nothing to fetch until we know who and where we are.
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(async (s: Session | null) => {
        setSession(s)
        if (!s) {
          localStorage.removeItem('golf_player_id')
          setMe(null)
          setPlayers([])
          setShowPicker(true)
          return
        }
        localStorage.setItem('golf_player_id', String(s.playerId))
        const raw = await fetch('/api/players').then(r => (r.ok ? r.json() : []))
        const data = (raw as Player[]).map(p => ({ ...p, id: Number(p.id) }))
        setPlayers(data)
        setMe(data.find(p => p.id === s.playerId) ?? null)
      })
  }, [refresh])

  const reload = useCallback(() => setRefresh(n => n + 1), [])

  function loggedIn() {
    setShowPicker(false)
    reload()
  }

  async function switchPlayer() {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('golf_player_id')
    setMe(null)
    setSession(null)
    setShowPicker(true)
  }

  return (
    <div className="screen">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="crest">⛳ Delhi Golf Club ⛳</div>
          <h1>{me ? `Hello, ${me.name}` : 'Golf Tracker'}</h1>
          <div className="sub">
            {me
              ? <>
                  Handicap {me.handicap.toFixed(1)}
                  {tracksMoney && <> · <span className={me.money >= 0 ? 'pos' : 'neg'}>{me.money >= 0 ? '+' : '−'}₹{Math.abs(me.money).toLocaleString('en-IN')}</span></>}
                </>
              : new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', marginTop: 8 }}>
          <button onClick={() => (me ? switchPlayer() : setShowPicker(true))} style={{
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10,
            color: 'var(--gold)', fontSize: 13, fontWeight: 600, padding: '7px 14px', cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            {me ? 'Switch' : 'Sign in'}
          </button>
          {session?.group && (
            <button
              onClick={() => session.groups.length > 1 && setShowSwitcher(true)}
              disabled={session.groups.length <= 1}
              style={{
                background: 'transparent', border: '1px solid var(--line)', borderRadius: 8,
                color: 'var(--muted)', fontSize: 11, fontWeight: 600, padding: '4px 10px',
                cursor: session.groups.length > 1 ? 'pointer' : 'default', fontFamily: 'inherit',
              }}
            >
              {session.group.name}{session.groups.length > 1 ? ' ▾' : ''}
            </button>
          )}
        </div>
      </div>

      <div className="stack">
        {me && (
          <div className="statgrid" style={tracksMoney ? undefined : { gridTemplateColumns: '1fr' }}>
            <div className="stat">
              <div className="label">Handicap</div>
              <div className="value gold-text">{me.handicap.toFixed(1)}</div>
              <div className="sub">current index</div>
            </div>
            {tracksMoney && (
              <div className="stat">
                <div className="label">Order of Merit</div>
                <div className={`value ${me.money >= 0 ? 'pos' : 'neg'}`}>
                  {me.money >= 0 ? '+' : '−'}₹{Math.abs(me.money).toLocaleString('en-IN')}
                </div>
                <div className="sub">total winnings</div>
              </div>
            )}
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

        <button
          className="cta-card"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={() => (me ? setShowSolo(true) : setShowPicker(true))}
        >
          <div>
            <div style={{ fontSize: 22, marginBottom: 4 }}>🧍</div>
            <div className="ttl">{amAdmin ? 'Enter a Score' : 'Solo Round'}</div>
            <div className="desc">
              {amAdmin ? 'Solo rounds — yours or any player’s (admin)' : `Played on your own? Enter your score${me ? '' : ' — sign in first'}`}
            </div>
          </div>
          <div className="chev">›</div>
        </button>

        {soloSaved && (
          <div className="panel" style={{ textAlign: 'center', color: 'var(--gold)', fontWeight: 600 }}>
            Round saved ✓ — handicap updated
          </div>
        )}

        {me && <LiveNowTeaser />}

        {me && tracksMoney && <QuickLeaderboard key={refresh} />}
      </div>

      {showPicker && (
        <LoginSheet
          initialGroup={session?.group?.slug ?? null}
          onLoggedIn={loggedIn}
          onClose={me ? () => setShowPicker(false) : undefined}
        />
      )}

      {showSwitcher && session && (
        <GroupSwitcherSheet
          groups={session.groups}
          current={session.group?.slug ?? null}
          onSwitched={() => { setShowSwitcher(false); reload() }}
          onClose={() => setShowSwitcher(false)}
        />
      )}

      {showSolo && me && (
        <SoloRoundSheet
          player={me}
          roster={amAdmin ? players : undefined}
          tracksMoney={tracksMoney}
          onSaved={() => {
            setShowSolo(false)
            setSoloSaved(true)
            reload()
            setTimeout(() => setSoloSaved(false), 4000)
          }}
          onClose={() => setShowSolo(false)}
        />
      )}
    </div>
  )
}

/** "Live now" card — shown only while at least one fourball is out playing. */
function LiveNowTeaser() {
  const [n, setN] = useState(0)
  useEffect(() => {
    fetch('/api/live-rounds')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { rounds: unknown[] } | null) => { if (d) setN(d.rounds.length) })
      .catch(() => { /* teaser is best-effort */ })
  }, [])
  if (n === 0) return null
  return (
    <Link href="/live" className="cta-card">
      <div>
        <div style={{ fontSize: 22, marginBottom: 4 }}>📡</div>
        <div className="ttl">Live now · {n} round{n > 1 ? 's' : ''}</div>
        <div className="desc">Watch the fourballs out on the course</div>
      </div>
      <div className="chev">›</div>
    </Link>
  )
}

function QuickLeaderboard() {
  const [data, setData] = useState<{ byMoney: { name: string; money: number }[] } | null>(null)
  useEffect(() => { fetch('/api/leaderboard').then(r => (r.ok ? r.json() : null)).then(setData) }, [])
  if (!data || data.byMoney.length === 0) return null
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
