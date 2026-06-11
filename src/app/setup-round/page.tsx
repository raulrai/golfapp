'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type Player = { id: number; name: string; handicap: number }
type Course = { id: number; name: string; course_rating: number; slope_rating: number; is_default: number }
type StrokeResult = { id: number; name: string; handicap: number; strokes: number }

export default function SetupRound() {
  const router = useRouter()
  const [players, setPlayers] = useState<Player[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [courseId, setCourseId] = useState<number | null>(null)
  const [pct, setPct] = useState(75)
  const [result, setResult] = useState<{ players: StrokeResult[]; backMarker: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'players' | 'course' | 'strokes'>('players')
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [newCourse, setNewCourse] = useState({ name: '', rating: '', slope: '' })

  useEffect(() => {
    fetch('/api/players').then(r => r.json()).then((data: Player[]) => {
      setPlayers(data.sort((a, b) => a.handicap - b.handicap))
    })
    fetch('/api/courses').then(r => r.json()).then((data: Course[]) => {
      setCourses(data)
      const def = data.find(c => c.is_default)
      if (def) setCourseId(def.id)
    })
  }, [])

  function togglePlayer(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function calculateStrokes() {
    setLoading(true)
    const res = await fetch('/api/stroke-calculator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_ids: selected, pct }),
    })
    const data = await res.json()
    setResult(data)
    setStep('strokes')
    setLoading(false)
  }

  async function createRound() {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch('/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, course_id: courseId, handicap_pct: pct, player_ids: selected }),
    })
    const data = await res.json()
    router.push(`/enter-score?round=${data.round_id}`)
  }

  async function addCourse() {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCourse.name, course_rating: parseFloat(newCourse.rating), slope_rating: parseFloat(newCourse.slope) }),
    })
    const data = await res.json()
    const updated: Course[] = await fetch('/api/courses').then(r => r.json())
    setCourses(updated)
    setCourseId(data.id)
    setShowAddCourse(false)
    setNewCourse({ name: '', rating: '', slope: '' })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'var(--green)', padding: '52px 24px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>‹</button>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: 0 }}>Set Up a Round</h1>
      </div>

      {/* Step indicator */}
      {step !== 'strokes' && (
        <div style={{ display: 'flex', gap: 8, padding: '16px', background: 'white', borderBottom: '1px solid #f3f4f6' }}>
          {['Select Players', 'Course & Settings'].map((s, i) => (
            <button key={s} onClick={() => setStep(i === 0 ? 'players' : 'course')} style={{
              flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: (i === 0 && step === 'players') || (i === 1 && step === 'course') ? 'var(--green)' : '#f3f4f6',
              color: (i === 0 && step === 'players') || (i === 1 && step === 'course') ? 'white' : 'var(--muted)',
            }}>{s}</button>
          ))}
        </div>
      )}

      <div style={{ padding: '16px' }}>

        {/* STEP 1: Player selection */}
        {step === 'players' && (
          <>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
              Select 2–4 players for today&apos;s round
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {players.map(p => {
                const on = selected.includes(p.id)
                return (
                  <button key={p.id} onClick={() => togglePlayer(p.id)} style={{
                    background: on ? '#f0f9f4' : 'white',
                    border: `2px solid ${on ? 'var(--green)' : '#e5e7eb'}`,
                    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    opacity: !on && selected.length >= 4 ? 0.4 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: on ? 'var(--green)' : '#f3f4f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, color: 'white',
                      }}>{on ? '✓' : ''}</div>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</span>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: 14 }}>HCP {p.handicap.toFixed(1)}</span>
                  </button>
                )
              })}
            </div>
            <button
              disabled={selected.length < 2}
              onClick={() => setStep('course')}
              style={{
                marginTop: 20, width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                background: selected.length >= 2 ? 'var(--green)' : '#e5e7eb',
                color: selected.length >= 2 ? 'white' : 'var(--muted)',
                fontSize: 16, fontWeight: 700, cursor: selected.length >= 2 ? 'pointer' : 'default',
              }}
            >
              Next: Course & Settings ({selected.length} selected)
            </button>
          </>
        )}

        {/* STEP 2: Course + handicap % */}
        {step === 'course' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Course</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {courses.map(c => (
                  <button key={c.id} onClick={() => setCourseId(c.id)} style={{
                    background: courseId === c.id ? '#f0f9f4' : 'white',
                    border: `2px solid ${courseId === c.id ? 'var(--green)' : '#e5e7eb'}`,
                    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}{c.is_default ? ' ★' : ''}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Rating {c.course_rating} · Slope {c.slope_rating}</div>
                    </div>
                    {courseId === c.id && <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span>}
                  </button>
                ))}
                <button onClick={() => setShowAddCourse(true)} style={{
                  background: 'white', border: '2px dashed #e5e7eb', borderRadius: 12,
                  padding: '14px', cursor: 'pointer', color: 'var(--muted)', fontWeight: 600, fontSize: 14,
                }}>
                  + Add New Course
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Handicap Allowance — {pct}%
              </div>
              <input type="range" min={50} max={100} step={5} value={pct} onChange={e => setPct(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--green)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                <span>50%</span><span>75% (default)</span><span>100%</span>
              </div>
            </div>

            <button
              disabled={!courseId || loading}
              onClick={calculateStrokes}
              style={{
                width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                background: courseId ? 'var(--green)' : '#e5e7eb',
                color: courseId ? 'white' : 'var(--muted)',
                fontSize: 16, fontWeight: 700, cursor: courseId ? 'pointer' : 'default',
              }}
            >
              {loading ? 'Calculating...' : 'Calculate Stroke Allowances'}
            </button>
          </>
        )}

        {/* STEP 3: Stroke card */}
        {step === 'strokes' && result && (
          <>
            <div style={{ background: 'white', borderRadius: 16, padding: '20px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Back Marker</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', marginBottom: 16 }}>{result.backMarker}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Stroke Card — {pct}% allowance
              </div>
              {result.players.sort((a, b) => a.handicap - b.handicap).map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: i < result.players.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>HCP {p.handicap.toFixed(1)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 28, fontWeight: 800,
                      color: p.strokes === 0 ? 'var(--gold, #C9A84C)' : 'var(--green)',
                    }}>
                      {p.strokes === 0 ? 'Scratch' : `+${p.strokes}`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {p.strokes === 0 ? 'back marker' : `stroke${p.strokes !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={createRound} style={{
                width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                background: 'var(--green)', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              }}>
                Save Round & Enter Scores →
              </button>
              <button onClick={() => setStep('players')} style={{
                width: '100%', padding: '14px', borderRadius: 14,
                border: '2px solid #e5e7eb', background: 'white',
                color: 'var(--muted)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>
                ← Start Over
              </button>
            </div>
          </>
        )}
      </div>

      {/* Add Course modal */}
      {showAddCourse && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '24px 16px 48px' }}>
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 4, margin: '0 auto 20px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Add New Course</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input placeholder="Course name" value={newCourse.name} onChange={e => setNewCourse(p => ({ ...p, name: e.target.value }))}
                style={{ padding: '14px', borderRadius: 10, border: '2px solid #e5e7eb', fontSize: 16, outline: 'none' }} />
              <input placeholder="Course Rating (e.g. 72.1)" value={newCourse.rating} onChange={e => setNewCourse(p => ({ ...p, rating: e.target.value }))}
                type="number" step="0.1" style={{ padding: '14px', borderRadius: 10, border: '2px solid #e5e7eb', fontSize: 16, outline: 'none' }} />
              <input placeholder="Slope Rating (e.g. 128)" value={newCourse.slope} onChange={e => setNewCourse(p => ({ ...p, slope: e.target.value }))}
                type="number" style={{ padding: '14px', borderRadius: 10, border: '2px solid #e5e7eb', fontSize: 16, outline: 'none' }} />
              <button onClick={addCourse} disabled={!newCourse.name || !newCourse.rating || !newCourse.slope}
                style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'var(--green)', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                Add Course
              </button>
              <button onClick={() => setShowAddCourse(false)}
                style={{ padding: '12px', borderRadius: 12, border: '2px solid #e5e7eb', background: 'white', color: 'var(--muted)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
