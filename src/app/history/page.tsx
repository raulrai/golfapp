'use client'
import { useEffect, useState } from 'react'
import BottomNav from '@/components/BottomNav'

type Score = { handicap_score: number; played_at: string; money_inr: number; adjusted_gross_score: number | null; course_name: string | null }
type Player = { id: number; name: string; handicap: number; money: number; scores: Score[] }

export default function History() {
  const [me, setMe] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = localStorage.getItem('golf_player_id')
    if (!id) { setLoading(false); return }
    fetch(`/api/players/${id}`).then(r => r.json()).then(data => {
      setMe(data)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="screen"><div className="empty"><div className="muted">Loading…</div></div></div>
  )

  if (!me) return (
    <div className="screen">
      <div className="empty">
        <div className="big">🏌️</div>
        <div className="rname">Select your player first</div>
        <div className="muted">Go to Home and tap “Who am I?”</div>
      </div>
      <BottomNav />
    </div>
  )

  return (
    <div className="screen">
      <div className="topbar">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1>{me.name}&apos;s History</h1>
        <div className="sub">
          {me.scores.length} rounds · HCP {me.handicap.toFixed(1)} · {me.money >= 0 ? '+' : '−'}₹{Math.abs(me.money).toLocaleString('en-IN')}
        </div>
      </div>

      <div className="stack">
        {me.scores.map((s, i) => {
          const isInHandicap = i < 12
          return (
            <div key={i} className="rowcard" style={{ opacity: isInHandicap ? 1 : 0.55 }}>
              <div style={{ flex: 1 }}>
                <div className="rname" style={{ fontSize: 14 }}>
                  {new Date(s.played_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <div className="rsub">
                  {s.course_name ?? 'Delhi Golf Club'}
                  {s.adjusted_gross_score ? ` · Gross ${s.adjusted_gross_score}` : ''}
                  {isInHandicap ? '' : ' · not counted'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div className="rval sm gold-text">
                  {s.handicap_score >= 0 ? '+' : ''}{s.handicap_score.toFixed(1)}
                </div>
                {s.money_inr !== 0 && (
                  <div className={`rsub ${s.money_inr >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                    {s.money_inr >= 0 ? '+' : '−'}₹{Math.abs(s.money_inr).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <BottomNav />
    </div>
  )
}
