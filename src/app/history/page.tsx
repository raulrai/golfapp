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
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--muted)' }}>Loading...</div>
    </div>
  )

  if (!me) return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏌️</div>
      <div style={{ fontWeight: 700, fontSize: 18 }}>Select your player first</div>
      <div style={{ color: 'var(--muted)', marginTop: 8 }}>Go to Home and tap &quot;Who am I?&quot;</div>
      <BottomNav />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 80 }}>
      <div style={{ background: 'var(--green)', padding: '52px 24px 24px' }}>
        <h1 style={{ color: 'white', fontSize: 24, fontWeight: 800, margin: 0 }}>{me.name}&apos;s History</h1>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>
          {me.scores.length} rounds · HCP {me.handicap.toFixed(1)} · {me.money >= 0 ? '+' : ''}₹{me.money.toLocaleString('en-IN')}
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {me.scores.map((s, i) => {
          const isInHandicap = i < 12
          return (
            <div key={i} style={{
              background: 'white', borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              opacity: isInHandicap ? 1 : 0.6,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {new Date(s.played_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {s.course_name ?? 'Delhi Golf Club'}
                  {s.adjusted_gross_score ? ` · Gross ${s.adjusted_gross_score}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>
                  {s.handicap_score >= 0 ? '+' : ''}{s.handicap_score.toFixed(1)}
                </div>
                {s.money_inr !== 0 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: s.money_inr >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                    {s.money_inr >= 0 ? '+' : ''}₹{Math.abs(s.money_inr).toLocaleString('en-IN')}
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
