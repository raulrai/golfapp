'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type Round = {
  id: number; date: string; course_name: string; course_rating: number; slope_rating: number
  players: { player_id: number; name: string; stroke_allowance: number }[]
  scores: { player_id: number }[]
}

function EnterScoreInner() {
  const router = useRouter()
  const params = useSearchParams()
  const roundParam = params.get('round')

  const [myId, setMyId] = useState<number | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [gross, setGross] = useState('')
  const [money, setMoney] = useState('')
  const [moneySign, setMoneySign] = useState<'won' | 'lost'>('won')
  const [submitted, setSubmitted] = useState(false)
  const [handicapScore, setHandicapScore] = useState<number | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('golf_player_id')
    if (id) setMyId(Number(id))
    fetch('/api/rounds').then(r => r.json()).then((data: Round[]) => {
      setRounds(data)
      if (roundParam) {
        const r = data.find((r: Round) => r.id === Number(roundParam))
        if (r) setSelectedRound(r)
      }
    })
  }, [roundParam])

  const myRounds = rounds.filter(r =>
    r.players.some(p => p.player_id === myId) &&
    !r.scores.some(s => s.player_id === myId)
  )

  async function submitScore() {
    if (!selectedRound || !gross || !myId) return
    const moneyVal = money ? parseInt(money) : 0
    const finalMoney = moneySign === 'lost' ? -moneyVal : moneyVal
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        round_id: selectedRound.id,
        player_id: myId,
        adjusted_gross_score: parseFloat(gross),
        money_inr: finalMoney,
      }),
    })
    const data = await res.json()
    setHandicapScore(data.handicap_score)
    setSubmitted(true)
  }

  const myStrokes = selectedRound?.players.find(p => p.player_id === myId)?.stroke_allowance

  if (submitted && handicapScore !== null) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', marginBottom: 8 }}>Score Saved!</h2>
        <div style={{ background: 'white', borderRadius: 16, padding: '24px', width: '100%', maxWidth: 320, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Handicap Score</div>
          <div style={{ fontSize: 42, fontWeight: 900, color: 'var(--green)' }}>
            {handicapScore >= 0 ? '+' : ''}{handicapScore.toFixed(1)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            ({gross} gross · {selectedRound?.course_name})
          </div>
        </div>
        <button onClick={() => router.push('/')} style={{
          background: 'var(--green)', color: 'white', border: 'none', borderRadius: 14,
          padding: '16px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
        }}>
          Back to Home
        </button>
        <BottomNav />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 80 }}>
      <div style={{ background: 'var(--green)', padding: '52px 24px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>‹</button>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: 0 }}>Enter My Score</h1>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {!myId && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px', color: '#991b1b', fontSize: 14 }}>
            Please select who you are from the home screen first.
          </div>
        )}

        {/* Round selection */}
        {!selectedRound && (
          <>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              Select the round you played:
            </div>
            {myRounds.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 14, padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏌️</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No pending rounds</div>
                <div style={{ fontSize: 13 }}>Ask someone to set up today&apos;s round first</div>
              </div>
            ) : (
              myRounds.map(r => (
                <button key={r.id} onClick={() => setSelectedRound(r)} style={{
                  background: 'white', border: '2px solid #e5e7eb', borderRadius: 14,
                  padding: '16px', textAlign: 'left', cursor: 'pointer', width: '100%',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{r.course_name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {r.players.map(p => p.name).join(', ')}
                  </div>
                </button>
              ))
            )}
          </>
        )}

        {/* Score entry form */}
        {selectedRound && myId && (
          <>
            <div style={{ background: 'white', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedRound.course_name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                {new Date(selectedRound.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {myStrokes !== undefined && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0f9f4', borderRadius: 8, display: 'inline-block' }}>
                  <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>
                    Your strokes: {myStrokes === 0 ? 'Scratch (back marker)' : `+${myStrokes}`}
                  </span>
                </div>
              )}
            </div>

            <div style={{ background: 'white', borderRadius: 14, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Adjusted Gross Score
              </label>
              <input
                type="number"
                placeholder="e.g. 78"
                value={gross}
                onChange={e => setGross(e.target.value)}
                style={{
                  width: '100%', padding: '16px', borderRadius: 12, border: '2px solid #e5e7eb',
                  fontSize: 28, fontWeight: 700, textAlign: 'center', outline: 'none',
                  boxSizing: 'border-box',
                  color: 'var(--green)',
                }}
              />
              {gross && (
                <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                  {Number(gross) - selectedRound.course_rating > 0 ? '+' : ''}{(Number(gross) - selectedRound.course_rating).toFixed(0)} vs course par
                </div>
              )}
            </div>

            <div style={{ background: 'white', borderRadius: 14, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Money
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setMoneySign('won')} style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: `2px solid ${moneySign === 'won' ? 'var(--positive)' : '#e5e7eb'}`,
                  background: moneySign === 'won' ? '#f0fdf4' : 'white',
                  color: moneySign === 'won' ? 'var(--positive)' : 'var(--muted)',
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                }}>Won ↑</button>
                <button onClick={() => setMoneySign('lost')} style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: `2px solid ${moneySign === 'lost' ? 'var(--negative)' : '#e5e7eb'}`,
                  background: moneySign === 'lost' ? '#fef2f2' : 'white',
                  color: moneySign === 'lost' ? 'var(--negative)' : 'var(--muted)',
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                }}>Lost ↓</button>
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 20, fontWeight: 700, color: moneySign === 'won' ? 'var(--positive)' : 'var(--negative)',
                }}>₹</span>
                <input
                  type="number"
                  placeholder="0"
                  value={money}
                  onChange={e => setMoney(e.target.value)}
                  style={{
                    width: '100%', padding: '16px 16px 16px 40px', borderRadius: 12,
                    border: `2px solid ${moneySign === 'won' ? '#bbf7d0' : '#fecaca'}`,
                    fontSize: 24, fontWeight: 700, outline: 'none', boxSizing: 'border-box',
                    color: moneySign === 'won' ? 'var(--positive)' : 'var(--negative)',
                  }}
                />
              </div>
            </div>

            <button
              onClick={submitScore}
              disabled={!gross}
              style={{
                width: '100%', padding: '18px', borderRadius: 14, border: 'none',
                background: gross ? 'var(--green)' : '#e5e7eb',
                color: gross ? 'white' : 'var(--muted)',
                fontSize: 17, fontWeight: 700, cursor: gross ? 'pointer' : 'default',
              }}
            >
              Save Score
            </button>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

export default function EnterScore() {
  return (
    <Suspense>
      <EnterScoreInner />
    </Suspense>
  )
}
