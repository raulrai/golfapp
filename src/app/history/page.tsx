'use client'
import { useCallback, useEffect, useState } from 'react'
import BottomNav from '@/components/BottomNav'
import Scorecard from '@/components/Scorecard'
import { liveMatches, liveAutoPress, playerName } from '@/lib/golf/game'
import { emojiForTag } from '@/lib/golf/moments'
import type { Game, GamePlayer } from '@/lib/golf/game'
import type { CourseMeta } from '@/lib/golf/course'
import type { PlayerId, Scores } from '@/lib/golf/types'

type Score = { round_id: number; handicap_score: number; played_at: string; money_inr: number; adjusted_gross_score: number | null; course_name: string | null }
type Player = { id: number; name: string; handicap: number; money: number; scores: Score[] }

type EditRow = { player_id: number; player_name: string; gross: string; money: string }
type RoundDetail = {
  date: string
  course_name: string | null
  scores: { player_id: number; player_name: string; adjusted_gross_score: number | null; money_inr: number }[]
}

type RoundFull = {
  id: number
  date: string
  course_name: string | null
  course_rating: number | string | null
  slope_rating: number | string | null
  handicap_pct: number | string | null
  format: 'match' | 'autopress' | 'both' | null
  stake: number | string | null
  team_a: (number | string)[] | null
  team_b: (number | string)[] | null
  players: { player_id: number | string; name: string; stroke_allowance: number | string }[]
  scores: { player_id: number | string; player_name: string; adjusted_gross_score: number | null; money_inr: number; holes_played?: number | string | null }[]
  holeScores: { player_id: number | string; hole: number | string; strokes: number | string }[]
  holes: { hole: number | string; par: number | string; stroke_index: number | string; yards: number | string }[]
  moments?: { hole: number | string | null; player_ids: (number | string)[] | null; tag: string; note: string | null; ts: string }[]
}

/** Rebuild a Game from a saved round so the live match-play / Auto Press engine can replay it. */
function gameFromRound(r: RoundFull): Game {
  const players: GamePlayer[] = r.players.map((p) => ({
    id: Number(p.player_id),
    name: p.name,
    handicap: 0,
    strokes: Number(p.stroke_allowance) || 0,
  }))

  const scores: Scores = {}
  for (const hs of r.holeScores) {
    const h = Number(hs.hole)
    ;(scores[h] ??= {})[Number(hs.player_id)] = Number(hs.strokes)
  }

  const teamA = (r.team_a ?? []).map(Number)
  const teamB = (r.team_b ?? []).map(Number)
  const singles: [PlayerId, PlayerId][] =
    teamA.length === 2 && teamB.length === 2
      ? [[teamA[0], teamB[0]], [teamA[1], teamB[1]]]
      : []

  const course: CourseMeta = {
    name: r.course_name ?? 'Delhi Golf Club',
    short: r.course_name ?? 'Delhi Golf Club',
    tees: '',
    par: r.holes.reduce((a, h) => a + Number(h.par), 0),
    rating: Number(r.course_rating) || 0,
    slope: Number(r.slope_rating) || 0,
    holes: r.holes.map((h) => ({
      n: Number(h.hole), par: Number(h.par), si: Number(h.stroke_index), yards: Number(h.yards), tip: '',
    })),
  }

  return {
    id: String(r.id),
    createdAt: 0,
    players,
    scoringMode: 'hole',
    format: r.format ?? 'match',
    allowancePct: Number(r.handicap_pct) || 75,
    teamA, teamB, singles,
    stake: Number(r.stake) || 0,
    scores,
    course,
  }
}

export default function History() {
  const [me, setMe] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [viewId, setViewId] = useState<number | null>(null)

  const load = useCallback(() => {
    const id = localStorage.getItem('golf_player_id')
    if (!id) { setLoading(false); return }
    return fetch(`/api/players/${id}`).then(r => r.json()).then(data => {
      setMe(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

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
              <button className="view-btn" onClick={() => setViewId(s.round_id)}>Card</button>
              <button className="edit-btn" onClick={() => setEditId(s.round_id)}>Edit</button>
            </div>
          )
        })}
      </div>

      {editId !== null && (
        <EditSheet
          roundId={editId}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); load() }}
        />
      )}

      {viewId !== null && (
        <ScorecardSheet roundId={viewId} onClose={() => setViewId(null)} />
      )}

      <BottomNav />
    </div>
  )
}

function EditSheet({ roundId, onClose, onSaved }: { roundId: number; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<RoundDetail | null>(null)
  const [rows, setRows] = useState<EditRow[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/rounds/${roundId}`).then(r => r.json()).then((d: RoundDetail) => {
      setDetail(d)
      setRows(d.scores.map(s => ({
        player_id: s.player_id,
        player_name: s.player_name,
        gross: s.adjusted_gross_score != null ? String(s.adjusted_gross_score) : '',
        money: s.money_inr ? String(s.money_inr) : '',
      })))
    }).catch(() => setErr('Could not load round'))
  }, [roundId])

  const setRow = (pid: number, key: 'gross' | 'money', val: string) =>
    setRows(rs => rs.map(r => r.player_id === pid ? { ...r, [key]: val } : r))

  const moneyBalance = rows.reduce((acc, r) => acc + (Number(r.money) || 0), 0)
  const valid = rows.length > 0 && rows.every(r => r.gross.trim() !== '' && Number.isFinite(Number(r.gross)) && Number(r.gross) > 0)

  const save = async () => {
    setSaving(true); setErr('')
    try {
      for (const r of rows) {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            round_id: roundId,
            player_id: r.player_id,
            adjusted_gross_score: Number(r.gross),
            money_inr: Number(r.money) || 0,
          }),
        })
        if (!res.ok) throw new Error('save failed')
      }
      onSaved()
    } catch {
      setErr('Save failed — please try again')
      setSaving(false)
    }
  }

  const del = async () => {
    if (!confirm('Delete this round? Everyone’s scores and winnings for it will be removed and handicaps recalculated. This cannot be undone.')) return
    setDeleting(true); setErr('')
    try {
      const res = await fetch(`/api/rounds/${roundId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      onSaved()
    } catch {
      setErr('Delete failed — please try again')
      setDeleting(false)
    }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="grip" />
        <h2>Edit round</h2>
        {!detail ? (
          <div className="muted" style={{ textAlign: 'center', padding: '12px 0' }}>{err || 'Loading…'}</div>
        ) : (
          <>
            <div className="edit-sub">
              {new Date(detail.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{detail.course_name ?? 'Delhi Golf Club'}
            </div>
            {rows.map(r => (
              <div className="edit-row" key={r.player_id}>
                <div className="edit-name">{r.player_name}</div>
                <div className="edit-fields">
                  <label className="edit-field">
                    <span>Gross</span>
                    <input
                      className="edit-input" inputMode="numeric" value={r.gross}
                      onChange={e => setRow(r.player_id, 'gross', e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </label>
                  <label className="edit-field">
                    <span>Money ₹</span>
                    <div className="money-input-row">
                      <button
                        type="button"
                        className={`sign-toggle ${r.money.startsWith('-') ? 'neg' : 'pos'}`}
                        aria-label="Toggle won / lost"
                        onClick={() => {
                          const digits = r.money.replace(/[^0-9]/g, '')
                          if (digits === '') return
                          setRow(r.player_id, 'money', r.money.startsWith('-') ? digits : '-' + digits)
                        }}
                      >
                        {r.money.startsWith('-') ? '−' : '+'}
                      </button>
                      <input
                        className="edit-input" inputMode="numeric" placeholder="₹"
                        value={r.money.replace('-', '')}
                        onChange={e => {
                          const digits = e.target.value.replace(/[^0-9]/g, '')
                          const neg = r.money.startsWith('-')
                          setRow(r.player_id, 'money', digits === '' ? '' : (neg ? '-' + digits : digits))
                        }}
                      />
                    </div>
                  </label>
                </div>
              </div>
            ))}
            <div className={`pot-line ${moneyBalance === 0 ? 'ok' : 'off'}`}>
              Money balance: {moneyBalance === 0 ? 'level ✓' : `${moneyBalance > 0 ? '+' : '−'}₹${Math.abs(moneyBalance).toLocaleString('en-IN')} (should net to zero)`}
            </div>
            {err && <div className="pot-line off">{err}</div>}
            <button className="primary" disabled={!valid || saving || deleting} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button className="danger" disabled={saving || deleting} onClick={del}>
              {deleting ? 'Deleting…' : 'Delete round'}
            </button>
            <button className="flat" disabled={saving || deleting} onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}

/* View a saved round: the scorecard plus the final match-play and Auto Press results. */
function ScorecardSheet({ roundId, onClose }: { roundId: number; onClose: () => void }) {
  const [round, setRound] = useState<RoundFull | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/rounds/${roundId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: RoundFull) => setRound(d))
      .catch(() => setErr('Could not load round'))
  }, [roundId])

  const hasCard = !!round && round.holeScores.length > 0 && round.holes.length === 18
  const game = hasCard ? gameFromRound(round!) : null
  const hasTeams = !!game && game.teamA.length > 0 && game.teamB.length > 0

  const showMatch = hasTeams && (game!.format === 'match' || game!.format === 'both')
  const showAp = hasTeams && (game!.format === 'autopress' || game!.format === 'both')
  const matches = showMatch ? liveMatches(game!) : []
  const ap = showAp ? liveAutoPress(game!) : null

  const shortSide = (side: PlayerId[]) =>
    side.map((id) => playerName(game!, id).split(' ')[0]).join('&')

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="grip" />
        <h2>Scorecard</h2>
        {!round ? (
          <div className="muted" style={{ textAlign: 'center', padding: '12px 0' }}>{err || 'Loading…'}</div>
        ) : (
          <>
            <div className="edit-sub">
              {new Date(round.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{round.course_name ?? 'Delhi Golf Club'}
            </div>

            {game ? <Scorecard game={game} /> : (
              <div className="result-note">Total-only round — no hole-by-hole card was recorded.</div>
            )}

            {(() => {
              const partial = round.scores.filter((s) => s.holes_played != null && Number(s.holes_played) < 18)
              if (partial.length === 0) return null
              const min = Math.min(...partial.map((s) => Number(s.holes_played)))
              return (
                <div className="result-note">
                  Ended early — scores pro-rated to 18 holes (from {min === Math.max(...partial.map((s) => Number(s.holes_played))) ? `${min} holes` : `${min}+ holes`}).
                </div>
              )
            })()}

            {matches.length > 0 && (
              <div className="result-block">
                <h3>Match Play</h3>
                {matches.map((m, i) => {
                  const s = m.state
                  const lead = s.diff > 0 ? m.a : m.b
                  const cls = s.winner === 'half' || s.diff === 0 ? 'as' : s.diff > 0 ? 'up-a' : 'up-b'
                  return (
                    <div className="result-row" key={i}>
                      <div>
                        <span className="result-who">{m.label}</span>
                        <span className="result-kind">{m.kind === 'fourball' ? 'Fourball better-ball' : 'Singles'}</span>
                      </div>
                      <span className={`result-val ${cls}`}>
                        {s.winner === 'half' ? 'Halved' : `${shortSide(lead)} ${s.resultText}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {ap && (
              <div className="result-block">
                <h3>Auto Press · ₹{game!.stake}/match</h3>
                {ap.bets.map((b) => {
                  const net = b.settlement.netToA
                  const lead = net > 0 ? game!.teamA : game!.teamB
                  return (
                    <div className="result-row" key={b.key}>
                      <div>
                        <span className="result-who">{b.label}</span>
                        <span className="result-kind">{b.string === '—' ? 'no result' : b.string}</span>
                      </div>
                      <span className={`result-val ${net === 0 ? 'as' : net > 0 ? 'up-a' : 'up-b'}`}>
                        {net === 0 ? 'level' : `${shortSide(lead)} +₹${Math.abs(net * game!.stake).toLocaleString('en-IN')}`}
                      </span>
                    </div>
                  )
                })}
                <div className="result-row">
                  <span className="result-who">Net</span>
                  <span className={`result-val ${ap.moneyToA === 0 ? 'as' : ap.moneyToA > 0 ? 'up-a' : 'up-b'}`}>
                    {ap.moneyToA === 0
                      ? 'level'
                      : `${shortSide(ap.moneyToA > 0 ? game!.teamA : game!.teamB)} +₹${Math.abs(ap.moneyToA).toLocaleString('en-IN')}`}
                  </span>
                </div>
              </div>
            )}

            {hasCard && !hasTeams && (
              <div className="result-note">Match play / Auto Press weren&apos;t recorded for this round.</div>
            )}

            {(round.moments?.length ?? 0) > 0 && (
              <div className="result-block">
                <h3>Moments</h3>
                {round.moments!.map((m, i) => {
                  const who = (m.player_ids ?? [])
                    .map((id) => round.players.find((p) => Number(p.player_id) === Number(id))?.name.split(' ')[0])
                    .filter(Boolean)
                  return (
                    <div className="moment-item" key={i}>
                      <span className="em">{emojiForTag(m.tag)}</span>
                      <div className="body">
                        <div className="head">{m.tag}{who.length > 0 ? ` — ${who.join(' & ')}` : ''}</div>
                        <div className="meta">{m.hole != null ? `Hole ${m.hole}` : ''}</div>
                        {m.note && <div className="note">“{m.note}”</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button className="flat" onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}
