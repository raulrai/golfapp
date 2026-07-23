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

        {me && <WeeklyRounds key={refresh} />}
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

type WeekEntry = {
  player_id: number
  name: string
  round_id: number
  gross: number | null
  net: number
  played_at: string
}

/** Net vs par, shown as a signed integer (negative = under par net = better). */
function netLabel(net: number): string {
  const r = Math.round(net)
  if (r === 0) return 'net E'
  return `net ${r > 0 ? '+' : '−'}${Math.abs(r)}`
}

/** The week's 5 best and 5 worst net rounds — the home page's play highlight,
 *  shown for every group (score-based, no money). */
function WeeklyRounds() {
  const [data, setData] = useState<{ best: WeekEntry[]; worst: WeekEntry[] } | null>(null)
  useEffect(() => {
    fetch('/api/weekly-rounds').then(r => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null))
  }, [])

  if (!data) return null

  const row = (e: WeekEntry, i: number, best: boolean) => (
    <div key={`${e.round_id}:${e.player_id}`} className="panel-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={best && i === 0 ? 'gold-text' : 'muted'} style={{ fontSize: 12, fontWeight: 700, width: 18, textAlign: 'center' }}>
          {best && i === 0 ? '🏅' : i + 1}
        </span>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{e.name}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
        <span className={best ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
          {netLabel(e.net)}
        </span>
        {e.gross != null && <span className="muted" style={{ fontSize: 12 }}>gross {e.gross}</span>}
      </div>
    </div>
  )

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <span className="lbl">Best rounds this week</span>
          <Link href="/history">History →</Link>
        </div>
        {data.best.length === 0 ? (
          <div className="muted" style={{ padding: '6px 2px', fontSize: 14 }}>No rounds recorded this week yet.</div>
        ) : (
          data.best.map((e, i) => row(e, i, true))
        )}
      </div>

      {data.worst.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <span className="lbl">Worst rounds this week</span>
          </div>
          {data.worst.map((e, i) => row(e, i, false))}
        </div>
      )}
    </>
  )
}
