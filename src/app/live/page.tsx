'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { liveMatches, liveAutoPress, playerName } from '@/lib/golf/game'
import { shortSide } from '@/components/MatchBar'
import type { LiveRoundSummary } from '@/lib/live'

const POLL_MS = 8000

/** The field view: every fourball out on the course right now. */
export default function LivePage() {
  const [rounds, setRounds] = useState<LiveRoundSummary[] | null>(null)
  const [needLogin, setNeedLogin] = useState(false)

  useEffect(() => {
    let stop = false
    const load = () =>
      fetch('/api/live-rounds')
        .then((r) => {
          if (r.status === 401) { setNeedLogin(true); return null }
          return r.ok ? r.json() : null
        })
        .then((d: { rounds: LiveRoundSummary[] } | null) => {
          if (!stop && d) { setNeedLogin(false); setRounds(d.rounds) }
        })
        .catch(() => { /* next tick retries */ })
    load()
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => { stop = true; clearInterval(tick) }
  }, [])

  return (
    <div className="screen">
      <div className="topbar">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1>Out on the Course</h1>
        <div className="sub">
          {rounds === null && !needLogin
            ? 'Loading…'
            : needLogin
              ? 'Sign in on the Home tab to watch live rounds'
              : rounds!.length === 0
                ? 'No live rounds right now'
                : `${rounds!.length} live round${rounds!.length > 1 ? 's' : ''} · updates every few seconds`}
        </div>
      </div>

      <div className="stack">
        {(rounds ?? []).map((r) => <LiveCard key={r.id} round={r} />)}
      </div>
    </div>
  )
}

function LiveCard({ round }: { round: LiveRoundSummary }) {
  const g = round.game
  const names = g.players.map((p) => playerName(g, p.id).split(' ')[0])
  const showMatch = g.scoringMode === 'hole' && (g.format === 'match' || g.format === 'both')
  const showAp = g.scoringMode === 'hole' && (g.format === 'autopress' || g.format === 'both')
  const match = showMatch ? liveMatches(g)[0] : null
  const ap = showAp ? liveAutoPress(g) : null
  const thru = ap?.thru ?? match?.state.thru ?? 0

  return (
    <Link href={`/live/${round.id}`} className="panel" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div className="panel-head">
        <span className="lbl">
          <span className="pos" style={{ marginRight: 6 }}>●</span>
          {g.scoringMode === 'total' ? 'Total only' : thru === 0 ? 'Teeing off' : `Thru ${thru}`}
        </span>
        <span>Watch →</span>
      </div>
      <div className="panel-row">
        <span style={{ fontWeight: 600, fontSize: 15 }}>{names.join(' · ')}</span>
      </div>
      {match && (
        <div className="panel-row">
          <span className="muted" style={{ fontSize: 13 }}>{match.kind === 'fourball' ? '4-Ball' : 'Singles'}</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {match.state.thru === 0
              ? '—'
              : match.state.diff === 0
                ? match.state.statusText
                : `${shortSide(g, match.state.diff > 0 ? match.a : match.b)} ${match.state.statusText}`}
          </span>
        </div>
      )}
      {ap && (
        <div className="panel-row">
          <span className="muted" style={{ fontSize: 13 }}>Auto Press</span>
          <span className={ap.moneyToA === 0 ? 'as' : ap.moneyToA > 0 ? 'pos' : 'neg'} style={{ fontSize: 14, fontWeight: 700 }}>
            {ap.thru === 0
              ? '—'
              : ap.leader
                ? `${shortSide(g, ap.leader)} +₹${Math.abs(ap.moneyToA).toLocaleString('en-IN')}`
                : 'all square'}
          </span>
        </div>
      )}
    </Link>
  )
}
