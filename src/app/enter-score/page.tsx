'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type Round = {
  id: number; date: string; course_name: string; course_rating: number; slope_rating: number
  players: { player_id: number; name: string; stroke_allowance: number }[]
  scores: { player_id: number; adjusted_gross_score: number | null; handicap_score: number; money_inr: number }[]
}

type PlayerScore = {
  gross: string
  money: string
  moneySign: 'won' | 'lost'
  alreadyDone: boolean
  handicapScore: number | null
}

function initScores(r: Round): Record<string, PlayerScore> {
  const map: Record<string, PlayerScore> = {}
  for (const p of r.players) {
    const existing = r.scores.find(s => Number(s.player_id) === Number(p.player_id))
    map[String(p.player_id)] = {
      gross: existing?.adjusted_gross_score != null ? String(existing.adjusted_gross_score) : '',
      money: existing ? String(Math.abs(existing.money_inr)) : '',
      moneySign: existing && existing.money_inr < 0 ? 'lost' : 'won',
      alreadyDone: !!existing,
      handicapScore: null,
    }
  }
  return map
}

function EnterScoreInner() {
  const router = useRouter()
  const params = useSearchParams()
  const roundParam = params.get('round')

  const [myId, setMyId] = useState<number | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [playerScores, setPlayerScores] = useState<Record<string, PlayerScore>>({})
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const id = localStorage.getItem('golf_player_id')
    if (id) setMyId(Number(id))
    fetch('/api/rounds').then(r => r.json()).then((data: Round[]) => {
      setRounds(data)
      if (roundParam) {
        const r = data.find((r: Round) => r.id === Number(roundParam))
        if (r) { setSelectedRound(r); setPlayerScores(initScores(r)) }
      }
    })
  }, [roundParam])

  const myRounds = rounds.filter(r =>
    r.players.some(p => Number(p.player_id) === myId) &&
    r.players.some(p => !r.scores.some(s => Number(s.player_id) === Number(p.player_id)))
  )

  function update(playerId: string, field: 'gross' | 'money' | 'moneySign', value: string) {
    setPlayerScores(prev => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }))
  }

  async function submitScores() {
    if (!selectedRound) return
    setSubmitting(true)

    const toSubmit = Object.entries(playerScores).filter(([, s]) => s.gross && !s.alreadyDone)

    await Promise.all(toSubmit.map(async ([playerId, score]) => {
      const moneyVal = score.money ? parseInt(score.money) : 0
      const finalMoney = score.moneySign === 'lost' ? -moneyVal : moneyVal
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_id: selectedRound.id,
          player_id: Number(playerId),
          adjusted_gross_score: parseFloat(score.gross),
          money_inr: finalMoney,
        }),
      })
      const data = await res.json()
      setPlayerScores(prev => ({
        ...prev,
        [playerId]: { ...prev[playerId], alreadyDone: true, handicapScore: data.handicap_score },
      }))
    }))

    setSubmitting(false)
    setSaved(true)
  }

  const pendingCount = Object.values(playerScores).filter(s => !s.alreadyDone && s.gross).length

  if (saved && selectedRound) {
    const results = selectedRound.players.map(p => ({
      name: p.name,
      isMe: Number(p.player_id) === myId,
      score: playerScores[String(p.player_id)],
    })).filter(p => p.score?.handicapScore !== null || p.score?.alreadyDone)

    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', marginBottom: 8 }}>Scores Saved!</h2>
        <div style={{ background: 'white', borderRadius: 16, padding: '20px', width: '100%', maxWidth: 360, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 24 }}>
          {results.map(({ name, isMe, score }) => score && (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{name}</span>
                {isMe && <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--green)', color: 'white', borderRadius: 6, padding: '2px 6px' }}>You</span>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {score.handicapScore !== null && (
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>
                    {score.handicapScore >= 0 ? '+' : ''}{score.handicapScore.toFixed(1)}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{score.gross} gross</div>
              </div>
            </div>
          ))}
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
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: 0 }}>Enter Scores</h1>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {!myId && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px', color: '#991b1b', fontSize: 14 }}>
            Please select who you are from the home screen first.
          </div>
        )}

        {!selectedRound && (
          <>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>Select the round:</div>
            {myRounds.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 14, padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏌️</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No pending rounds</div>
                <div style={{ fontSize: 13 }}>Ask someone to set up today&apos;s round first</div>
              </div>
            ) : (
              myRounds.map(r => (
                <button key={r.id} onClick={() => { setSelectedRound(r); setPlayerScores(initScores(r)) }} style={{
                  background: 'white', border: '2px solid #e5e7eb', borderRadius: 14,
                  padding: '16px', textAlign: 'left', cursor: 'pointer', width: '100%',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{r.course_name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}{r.players.map(p => p.name).join(', ')}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                    {r.players.filter(p => !r.scores.some(s => Number(s.player_id) === Number(p.player_id))).length} score(s) pending
                  </div>
                </button>
              ))
            )}
          </>
        )}

        {selectedRound && (
          <>
            <div style={{ background: 'white', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedRound.course_name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                  {new Date(selectedRound.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              </div>
              <button onClick={() => { setSelectedRound(null); setSaved(false) }} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Change
              </button>
            </div>

            {selectedRound.players.map(p => {
              const pid = String(p.player_id)
              const s = playerScores[pid]
              const isMe = Number(p.player_id) === myId
              if (!s) return null

              return (
                <div key={pid} style={{
                  background: 'white', borderRadius: 14, padding: '16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                  border: isMe ? '2px solid var(--green)' : '2px solid transparent',
                  opacity: s.alreadyDone && s.handicapScore === null ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</span>
                      {isMe && <span style={{ fontSize: 11, background: 'var(--green)', color: 'white', borderRadius: 6, padding: '2px 6px' }}>You</span>}
                      {p.stroke_allowance > 0 && <span style={{ fontSize: 11, background: '#f0f9f4', color: 'var(--green)', borderRadius: 6, padding: '2px 6px' }}>+{p.stroke_allowance} strokes</span>}
                    </div>
                    {s.alreadyDone && s.handicapScore === null && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Already scored</span>
                    )}
                    {s.handicapScore !== null && (
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>
                        {s.handicapScore >= 0 ? '+' : ''}{s.handicapScore.toFixed(1)} ✓
                      </span>
                    )}
                  </div>

                  {!s.alreadyDone && (
                    <>
                      <input
                        type="number"
                        placeholder="Gross score (e.g. 78)"
                        value={s.gross}
                        onChange={e => update(pid, 'gross', e.target.value)}
                        style={{
                          width: '100%', padding: '14px', borderRadius: 10, border: '2px solid #e5e7eb',
                          fontSize: 22, fontWeight: 700, textAlign: 'center', outline: 'none',
                          boxSizing: 'border-box', color: 'var(--green)', marginBottom: 10,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        {(['won', 'lost'] as const).map(sign => (
                          <button key={sign} onClick={() => update(pid, 'moneySign', sign)} style={{
                            flex: 1, padding: '10px', borderRadius: 8,
                            border: `2px solid ${s.moneySign === sign ? (sign === 'won' ? 'var(--positive)' : 'var(--negative)') : '#e5e7eb'}`,
                            background: s.moneySign === sign ? (sign === 'won' ? '#f0fdf4' : '#fef2f2') : 'white',
                            color: s.moneySign === sign ? (sign === 'won' ? 'var(--positive)' : 'var(--negative)') : 'var(--muted)',
                            fontWeight: 700, fontSize: 14, cursor: 'pointer',
                          }}>{sign === 'won' ? 'Won ↑' : 'Lost ↓'}</button>
                        ))}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 700, color: 'var(--muted)' }}>₹</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={s.money}
                          onChange={e => update(pid, 'money', e.target.value)}
                          style={{
                            width: '100%', padding: '12px 12px 12px 36px', borderRadius: 10,
                            border: '2px solid #e5e7eb', fontSize: 18, fontWeight: 700,
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )
            })}

            <button
              onClick={submitScores}
              disabled={pendingCount === 0 || submitting}
              style={{
                width: '100%', padding: '18px', borderRadius: 14, border: 'none',
                background: pendingCount > 0 ? 'var(--green)' : '#e5e7eb',
                color: pendingCount > 0 ? 'white' : 'var(--muted)',
                fontSize: 17, fontWeight: 700, cursor: pendingCount > 0 ? 'pointer' : 'default',
              }}
            >
              {submitting ? 'Saving...' : `Save ${pendingCount} Score${pendingCount !== 1 ? 's' : ''}`}
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
