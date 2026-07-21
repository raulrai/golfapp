'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import './play.css'
import {
  COURSE, courseOf, loadGame, saveGame, holeStrokes, effectiveMoney, playerName, holeResults,
  roundHolesPlayed, MIN_HOLES_TO_RECORD,
} from '@/lib/golf/game'
import type { Game, GamePlayer, Moment } from '@/lib/golf/game'
import type { CourseMeta, TeeColor } from '@/lib/golf/course'
import Scorecard from '@/components/Scorecard'
import PlayerCardSheet from '@/components/PlayerCardSheet'
import MomentSheet from '@/components/MomentSheet'
import MatchBar from '@/components/MatchBar'
import LoginSheet from '@/components/LoginSheet'
import WhatIfSheet from '@/components/WhatIfSheet'
import { useTracksMoney } from '@/components/GroupProvider'
import { emojiForTag, isStoryTag } from '@/lib/golf/moments'
import { TEES, DEFAULT_TEE, teeInfo, withTee } from '@/lib/golf/course'
import { fieldStrokes, strokesOnHole } from '@/lib/golf/strokes'
import type { Format, PlayerId, ScoringMode } from '@/lib/golf/types'
import { useLiveRound, loadLiveRoundId, saveLiveRoundId } from '@/lib/useLiveRound'
import type { LiveOp, LiveRoundSummary } from '@/lib/live'

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

type RosterPlayer = { id: number; name: string; handicap: number }
type Me = { playerId: number; name: string }

export default function PlayPage() {
  const router = useRouter()
  const tracksMoney = useTracksMoney()
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [course, setCourse] = useState<CourseMeta>(COURSE)
  const [liveId, setLiveId] = useState<number | null>(null)
  const [joinable, setJoinable] = useState<LiveRoundSummary[]>([])
  const [showSetup, setShowSetup] = useState(false)
  const [resolving, setResolving] = useState(true)
  const [startErr, setStartErr] = useState('')

  const live = useLiveRound(liveId)

  useEffect(() => {
    fetch('/api/course')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c: CourseMeta) => { if (c?.holes?.length) setCourse(c) })
      .catch(() => { /* keep the bundled fallback course */ })
    fetch('/api/players')
      .then((r) => r.json())
      .then((d: RosterPlayer[]) => setRoster(d.map((p) => ({ ...p, id: Number(p.id) }))))
      .catch(() => setRoster([]))
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null))
  }, [])

  // Once we know who's logged in: rejoin our saved live round, migrate a
  // pre-sync localStorage round to the server, or list joinable rounds.
  useEffect(() => {
    if (!me) return
    let cancelled = false
    ;(async () => {
      const saved = loadLiveRoundId()
      if (saved !== null) {
        if (!cancelled) { setLiveId(saved); setResolving(false) }
        return
      }
      const legacy = loadGame()
      if (legacy && legacy.players.some((p) => Number(p.id) === me.playerId)) {
        try {
          const res = await fetch('/api/live-rounds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game: legacy }),
          })
          if (res.ok) {
            const { id } = await res.json()
            saveGame(null) // migrated — the server copy is now the truth
            saveLiveRoundId(id)
            if (!cancelled) { setLiveId(id); setResolving(false) }
            return
          }
        } catch { /* offline — leave the legacy round in place and fall through */ }
      }
      try {
        const res = await fetch('/api/live-rounds')
        if (res.ok) {
          const { rounds } = (await res.json()) as { rounds: LiveRoundSummary[] }
          const mine = rounds.filter((r) => r.playerIds.includes(me.playerId))
          if (!cancelled) setJoinable(mine)
        }
      } catch { /* list is best-effort */ }
      if (!cancelled) setResolving(false)
    })()
    return () => { cancelled = true }
  }, [me])

  // A round can end under us via another phone's poll: discard → back to setup.
  // Guarded adjust-during-render; clearing localStorage here is idempotent.
  if (liveId !== null && (live.status === 'discarded' || live.status === 'gone')) {
    saveLiveRoundId(null)
    setLiveId(null)
    setShowSetup(false)
    setJoinable([])
  }

  const join = (id: number) => {
    saveLiveRoundId(id)
    setLiveId(id)
  }

  const startRound = async (g: Game) => {
    setStartErr('')
    try {
      const res = await fetch('/api/live-rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: g }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setStartErr(data.error ?? 'Could not start the round'); return }
      join(data.id)
    } catch {
      setStartErr('Network error — could not start the round')
    }
  }

  const finishRound = async () => {
    const r = await live.finish()
    if ('roundId' in r) saveLiveRoundId(null)
    return r
  }

  const discardRound = async () => {
    const r = await live.discard()
    if (r.ok) { saveLiveRoundId(null); setLiveId(null); setJoinable([]) }
    return r
  }

  const game = liveId !== null ? live.game : null

  return (
    <div className="play">
      <header className="play-head">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1 className="serif">The Round</h1>
        <div className="sub">{course.short} · {(game ? courseOf(game) : course).tees}</div>
      </header>

      {me === undefined || (me && resolving) ? null : me === null ? (
        <>
          <div className="total-hint" style={{ textAlign: 'center', marginTop: 20 }}>
            Sign in to score a round.
          </div>
          <LoginSheet onLoggedIn={() => window.location.reload()} />
        </>
      ) : liveId !== null ? (
        !game ? (
          <div className="total-hint" style={{ textAlign: 'center', marginTop: 20 }}>
            {live.status === 'gone' ? 'Round not found.' : 'Loading round…'}
          </div>
        ) : live.status === 'finished' ? (
          <div className="save-card">
            <div className="setup-label">Round saved</div>
            <div className="saved-msg">✓ Saved — handicaps{tracksMoney ? ' & money' : ''} updated</div>
            <button
              className="cta"
              onClick={() => { saveLiveRoundId(null); router.push('/') }}
            >Done</button>
          </div>
        ) : (
          <Scoring
            game={game}
            mutate={live.mutate}
            pendingCount={live.pendingCount}
            onFinish={finishRound}
            onDiscard={discardRound}
          />
        )
      ) : (
        <>
          {joinable.length > 0 && !showSetup && (
            <div className="setup-step">
              <div className="setup-label">Your fourball is already playing</div>
              {joinable.map((r) => (
                <button key={r.id} className="cta" style={{ marginBottom: 8 }} onClick={() => join(r.id)}>
                  Join · {r.game.players.map((p) => playerName(r.game, p.id).split(' ')[0]).join(' · ')}
                </button>
              ))}
              <button className="cta ghost" onClick={() => setShowSetup(true)}>Start a different round</button>
            </div>
          )}
          {(joinable.length === 0 || showSetup) && (
            <>
              {startErr && <div className="err-msg">⚠ {startErr}</div>}
              <Setup course={course} onStart={startRound} />
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ───────────────────────── Setup ───────────────────────── */

function Setup({ course, onStart }: { course: CourseMeta; onStart: (g: Game) => void }) {
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [count, setCount] = useState<2 | 4 | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [tee, setTee] = useState<TeeColor>(DEFAULT_TEE)
  const [allowancePct, setAllowancePct] = useState(75)
  const [mode, setMode] = useState<ScoringMode | null>(null)
  const [format, setFormat] = useState<Format | null>(null)
  const [teamA, setTeamA] = useState<number[]>([])
  const [stake, setStake] = useState(200)
  // A non-money group keeps Auto Press but settles it in matches won, so there
  // is no stake to pick and none to store.
  const tracksMoney = useTracksMoney()

  useEffect(() => {
    fetch('/api/players')
      .then((r) => r.json())
      .then((d: RosterPlayer[]) =>
        setRoster(
          d.map((p) => ({ ...p, id: Number(p.id) })).sort((a, b) => a.handicap - b.handicap),
        ),
      )
      .catch(() => setRoster([]))
  }, [])

  const togglePick = (id: number) => {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      if (count && cur.length >= count) return cur
      return [...cur, id]
    })
    setTeamA((cur) => cur.filter((x) => x !== id))
  }

  const toggleTeamA = (id: number) => {
    setTeamA((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      if (cur.length >= 2) return cur
      return [...cur, id]
    })
  }

  const needTeams = count === 4
  const teamsReady = !needTeams || teamA.length === 2
  const needFormat = mode === 'hole'
  const ready =
    count !== null &&
    picked.length === count &&
    mode !== null &&
    (!needFormat || format !== null) &&
    teamsReady

  const start = () => {
    if (!ready || count === null) return
    const chosen = picked.map((id) => roster.find((r) => r.id === id)!).filter(Boolean)
    const strokes = fieldStrokes(chosen, allowancePct)
    const players: GamePlayer[] = chosen.map((p, i) => ({
      id: p.id, name: p.name, handicap: p.handicap, strokes: strokes[i],
    }))

    let a: PlayerId[], b: PlayerId[], singles: [PlayerId, PlayerId][]
    if (count === 4) {
      a = teamA
      b = picked.filter((id) => !teamA.includes(id))
      singles = [[a[0], b[0]], [a[1], b[1]]]
    } else {
      a = [picked[0]]
      b = [picked[1]]
      singles = []
    }

    onStart({
      id: `${Date.now()}`,
      createdAt: Date.now(),
      players,
      scoringMode: mode!,
      allowancePct,
      format: needFormat ? format! : 'match',
      teamA: a, teamB: b, singles,
      stake: tracksMoney ? stake : 0,
      scores: {},
      course: withTee(course, tee),
      tee,
    })
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="setup-step">
        <div className="setup-label">How many players</div>
        <div className="seg">
          {[2, 4].map((n) => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => { setCount(n as 2 | 4); setPicked([]); setTeamA([]) }}>
              {n} Players<span className="lbl-sub">{n === 2 ? 'Singles' : 'Fourball / Singles'}</span>
            </button>
          ))}
        </div>
      </div>

      {count && (
        <div className="setup-step">
          <div className="setup-label">Who&rsquo;s playing · pick {count} ({picked.length}/{count})</div>
          <div className="roster">
            {roster.map((p) => (
              <button key={p.id} className={picked.includes(p.id) ? 'on' : ''} onClick={() => togglePick(p.id)}>
                <span>{p.name}</span>
                <span className="hcp">{p.handicap.toFixed(1)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {count && picked.length === count && (
        <div className="setup-step">
          <div className="setup-label">Course</div>
          <div className="team-col"><div className="slot filled">{course.name}</div></div>
        </div>
      )}

      {count && picked.length === count && (
        <div className="setup-step">
          <div className="setup-label">Tees · play from</div>
          <div className="seg cols-3">
            {TEES.map((t) => (
              <button
                key={t.color}
                className={`tee-btn tee-${t.color.toLowerCase()} ${tee === t.color ? 'on' : ''}`}
                onClick={() => setTee(t.color)}
              >
                <span className="tee-dot" aria-hidden />
                {t.color}
                <span className="lbl-sub">{t.rating} / {t.slope}</span>
              </button>
            ))}
          </div>
          {teeInfo(tee).provisional && (
            <div className="hcp-note">
              {tee} rating/slope are provisional and share Blue&apos;s yardages until measured.
            </div>
          )}
        </div>
      )}

      {count && picked.length === count && (
        <div className="setup-step">
          <div className="setup-label">Handicap allowance · {allowancePct}% of the difference</div>
          <input
            className="hcp-slider"
            type="range"
            min={50}
            max={100}
            step={5}
            value={allowancePct}
            onChange={(e) => setAllowancePct(Number(e.target.value))}
          />
          <div className="hcp-ticks">
            <span>50%</span><span>75%</span><span>100%</span>
          </div>
          <div className="hcp-note">
            Full difference is 100%. Match play commonly plays off 75–90% to keep it fair.
          </div>
        </div>
      )}

      {count && picked.length === count && (
        <div className="setup-step">
          <div className="setup-label">Stroking · who gets shots</div>
          <StrokePreview
            players={picked.map((id) => roster.find((r) => r.id === id)!).filter(Boolean)}
            course={course}
            allowancePct={allowancePct}
          />
        </div>
      )}

      {count && picked.length === count && (
        <div className="setup-step">
          <div className="setup-label">Scoring</div>
          <div className="seg">
            <button className={mode === 'hole' ? 'on' : ''} onClick={() => setMode('hole')}>Hole by hole<span className="lbl-sub">Live match + presses</span></button>
            <button className={mode === 'total' ? 'on' : ''} onClick={() => setMode('total')}>Total only<span className="lbl-sub">Just the card</span></button>
          </div>
        </div>
      )}

      {mode === 'hole' && (
        <div className="setup-step">
          <div className="setup-label">Format</div>
          <div className="seg cols-3">
            <button className={format === 'match' ? 'on' : ''} onClick={() => setFormat('match')}>Match Play</button>
            <button className={format === 'autopress' ? 'on' : ''} onClick={() => setFormat('autopress')}>Auto Press</button>
            <button className={format === 'both' ? 'on' : ''} onClick={() => setFormat('both')}>Both</button>
          </div>
        </div>
      )}

      {tracksMoney && mode === 'hole' && (format === 'autopress' || format === 'both') && (
        <div className="setup-step">
          <div className="setup-label">Stake · ₹ per Auto Press match</div>
          <div className="seg cols-3">
            {[200, 300, 500].map((v) => (
              <button key={v} className={stake === v ? 'on' : ''} onClick={() => setStake(v)}>₹{v}</button>
            ))}
          </div>
        </div>
      )}

      {needTeams && mode !== null && (
        <div className="setup-step">
          <div className="setup-label">Team A · pick 2 ({teamA.length}/2) · rest are Team B</div>
          <div className="team-pick">
            <div className="team-col">
              <h4>Team A</h4>
              {picked.filter((id) => teamA.includes(id)).map((id) => (
                <div key={id} className="slot filled" onClick={() => toggleTeamA(id)}>{playerNameFrom(roster, id)}</div>
              ))}
              {teamA.length < 2 && <div className="slot">tap a name below</div>}
            </div>
            <div className="team-col">
              <h4>Team B</h4>
              {picked.filter((id) => !teamA.includes(id)).map((id) => (
                <div key={id} className="slot filled">{playerNameFrom(roster, id)}</div>
              ))}
              {picked.filter((id) => !teamA.includes(id)).length === 0 && <div className="slot">—</div>}
            </div>
          </div>
          <div className="seg cols-4" style={{ marginTop: 8 }}>
            {picked.map((id) => (
              <button key={id} className={teamA.includes(id) ? 'on' : ''} onClick={() => toggleTeamA(id)}>
                {playerNameFrom(roster, id)}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="cta" disabled={!ready} onClick={start}>Start Round</button>
    </div>
  )
}

const playerNameFrom = (roster: RosterPlayer[], id: number) => roster.find((r) => r.id === id)?.name ?? '?'

/* Per-player stroke summary shown before format is chosen. */
function StrokePreview({
  players, course, allowancePct,
}: {
  players: RosterPlayer[]; course: CourseMeta; allowancePct: number
}) {
  if (players.length === 0) return null
  const strokes = fieldStrokes(players, allowancePct)
  // holes ordered by stroke index (hardest first) — that's where shots land
  const bySi = [...course.holes].sort((a, b) => a.si - b.si)

  const rows = players
    .map((p, i) => ({ p, total: strokes[i] }))
    .sort((a, b) => a.total - b.total)

  return (
    <div className="stroke-preview">
      {rows.map(({ p, total }) => {
        // hole numbers receiving 1 stroke and (separately) those getting 2
        const ones = bySi.filter((h) => strokesOnHole(total, h.si) === 1).map((h) => h.n)
        const twos = bySi.filter((h) => strokesOnHole(total, h.si) >= 2).map((h) => h.n)
        return (
          <div className="stroke-row" key={p.id}>
            <div className="stroke-top">
              <span className="pname">{p.name}</span>
              <span className="stroke-count">
                {total === 0 ? 'scratch' : `${total} stroke${total > 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="stroke-where">
              {total === 0
                ? 'plays off the low marker — gives shots to the field'
                : (
                  <>
                    {twos.length > 0 && <>2 on holes <b>{twos.join(', ')}</b>{ones.length > 0 ? ' · ' : ''}</>}
                    {ones.length > 0 && <>1 on holes <b>{ones.join(', ')}</b></>}
                  </>
                )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ───────────────────────── Scoring ───────────────────────── */

const REL: Record<number, string> = { [-2]: 'Eagle', [-1]: 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Dbl', 3: '+3' }

function Scoring({ game, mutate, pendingCount, onFinish, onDiscard }: {
  game: Game
  mutate: (op: LiveOp) => void
  pendingCount: number
  onFinish: () => Promise<{ roundId: number } | { error: string }>
  onDiscard: () => Promise<{ ok: boolean; error?: string }>
}) {
  const firstIncomplete = () => {
    for (let h = 1; h <= 18; h++) {
      if (!game.players.every((p) => typeof game.scores[h]?.[p.id] === 'number')) return h
    }
    return 18
  }
  const [hole, setHole] = useState(firstIncomplete)
  const [view, setView] = useState<'play' | 'card' | 'moments'>('play')
  const [cardId, setCardId] = useState<PlayerId | null>(null)
  const [showMoment, setShowMoment] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [whatIf, setWhatIf] = useState(false)
  const [seen17, setSeen17] = useState(false)

  const showsAp = game.format === 'autopress' || game.format === 'both'
  const thru = game.scoringMode === 'hole' ? holeResults(game).length : 0

  // Auto-open the 18th-hole what-if once, the moment hole 17 completes.
  // State-driven (not tap-driven) because the 17th can finish via another
  // marker's phone; guarded adjust-during-render, dismissal is remembered
  // per round for the session.
  if (showsAp && thru === 17 && !seen17) {
    setSeen17(true)
    if (!sessionStorage.getItem(`ap17_${game.id}`)) setWhatIf(true)
  }

  const closeWhatIf = () => {
    setWhatIf(false)
    try { sessionStorage.setItem(`ap17_${game.id}`, '1') } catch { /* remember-me is best-effort */ }
  }

  if (game.scoringMode === 'total') {
    return <TotalEntry game={game} mutate={mutate} onFinish={onFinish} onDiscard={onDiscard} />
  }

  const allComplete = (() => {
    for (let h = 1; h <= 18; h++) {
      if (!game.players.every((p) => typeof game.scores[h]?.[p.id] === 'number')) return false
    }
    return true
  })()

  const course = courseOf(game)
  const info = course.holes[hole - 1]

  // Group entry rows by team — teamA on top, then teamB — so partners sit
  // together. Falls back to selection order when there are no teams.
  const orderedPlayers: GamePlayer[] = (() => {
    if (game.teamA.length === 0 || game.teamB.length === 0) return game.players
    const teamOrder = [...game.teamA, ...game.teamB]
    const byTeam = teamOrder
      .map((id) => game.players.find((p) => p.id === id))
      .filter((p): p is GamePlayer => !!p)
    const rest = game.players.filter((p) => !teamOrder.includes(p.id))
    return [...byTeam, ...rest]
  })()

  const setScore = (pid: PlayerId, score: number | null) => {
    mutate({ op: 'score', hole, playerId: pid, strokes: score })
    const scores = { ...game.scores, [hole]: { ...game.scores[hole] } }
    if (score === null) delete scores[hole][pid]
    else scores[hole][pid] = score
    const allIn = game.players.every((p) => typeof scores[hole]?.[p.id] === 'number')
    if (allIn && score !== null && hole < 18) setTimeout(() => setHole((h) => Math.min(18, h + 1)), 700)
  }

  const addMoment = (who: PlayerId[], tag: string, note: string) => {
    const m: Moment = { id: newId(), hole, players: who, tag, note: note || undefined, ts: Date.now() }
    mutate({ op: 'moment.add', moment: m })
    setShowMoment(false)
  }
  const deleteMoment = (id: string) => mutate({ op: 'moment.delete', momentId: id })

  const moments = game.moments ?? []

  return (
    <div>
      <div className="seg cols-3 view-toggle">
        <button className={view === 'play' ? 'on' : ''} onClick={() => setView('play')}>Play</button>
        <button className={view === 'card' ? 'on' : ''} onClick={() => setView('card')}>Scorecard</button>
        <button className={view === 'moments' ? 'on' : ''} onClick={() => setView('moments')}>
          Moments{moments.length > 0 ? ` · ${moments.length}` : ''}
        </button>
      </div>

      {view === 'card' ? (
        <Scorecard game={game} />
      ) : view === 'moments' ? (
        <MomentsList game={game} moments={moments} onDelete={deleteMoment} onAdd={() => setShowMoment(true)} />
      ) : (
        <>
          <div className="hole-head">
            <span className="course-chip">{course.short} · {course.tees}</span>
            <div className="hole-num-row">
              <button className="hole-nav-btn" disabled={hole === 1} onClick={() => setHole(hole - 1)}>‹</button>
              <div>
                <div className="hole-num serif">{hole}</div>
                <div className="hole-meta">Par <b>{info.par}</b> · {info.yards} yds · SI <b>{info.si}</b></div>
              </div>
              <button className="hole-nav-btn" disabled={hole === 18} onClick={() => setHole(hole + 1)}>›</button>
            </div>
          </div>

          <div className="tam-tip">
            <span className="tam-label">Caddie says</span>
            {info.tip}
          </div>

          {orderedPlayers.map((p) => (
            <ScoreRow
              key={p.id}
              game={game}
              player={p}
              hole={hole}
              par={info.par}
              value={game.scores[hole]?.[p.id]}
              onSet={(s) => setScore(p.id, s)}
              onShowCard={() => setCardId(p.id)}
            />
          ))}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        <button className="cta ghost" style={{ flex: 1 }} onClick={() => setShowMoment(true)}>
          📖 Moment
        </button>
        <button className="cta ghost" style={{ flex: 1 }} onClick={() => setEndOpen(true)}>
          End Round
        </button>
      </div>

      {pendingCount > 0 && (
        <div className="total-hint" style={{ textAlign: 'center', margin: '8px 0' }}>
          ↻ {pendingCount} score{pendingCount > 1 ? 's' : ''} waiting to sync…
        </div>
      )}

      <MatchBar game={game}>
        {thru === 17 && (
          <button
            onClick={() => setWhatIf(true)}
            style={{
              width: '100%', marginTop: 8, padding: '8px 0', cursor: 'pointer',
              background: 'transparent', border: '1px dashed var(--line)', borderRadius: 10,
              color: 'var(--gold)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            🔮 What happens on the 18th?
          </button>
        )}
      </MatchBar>

      {allComplete && <SaveSection game={game} onFinish={onFinish} />}

      {cardId !== null && (() => {
        const p = game.players.find((x) => x.id === cardId)
        return p ? <PlayerCardSheet game={game} player={p} onClose={() => setCardId(null)} /> : null
      })()}

      {showMoment && (
        <MomentSheet
          players={game.players}
          hole={hole}
          onClose={() => setShowMoment(false)}
          onSave={addMoment}
        />
      )}

      {whatIf && <WhatIfSheet game={game} onClose={closeWhatIf} />}

      {endOpen && <EndRoundSheet game={game} onFinish={onFinish} onDiscard={onDiscard} onClose={() => setEndOpen(false)} />}
    </div>
  )
}

/* The day's diary — moments newest-first, with an add button and delete. */
function MomentsList({ game, moments, onDelete, onAdd }: {
  game: Game; moments: Moment[]; onDelete: (id: string) => void; onAdd: () => void
}) {
  const sorted = [...moments].sort((a, b) => b.ts - a.ts)
  const shortOf = (id: PlayerId) => game.players.find((p) => p.id === id)?.name.split(' ')[0] ?? '—'
  return (
    <div>
      <button className="cta ghost" style={{ marginBottom: 12 }} onClick={onAdd}>📖 Add a moment</button>
      {sorted.length === 0 ? (
        <div className="total-hint" style={{ textAlign: 'center' }}>
          No moments yet. Tag the day&apos;s shots, putts and trash talk as they happen.
        </div>
      ) : (
        sorted.map((m) => {
          const story = isStoryTag(m.tag)
          return (
            <div className={`moment-item${story ? ' story' : ''}`} key={m.id}>
              <span className="em">{emojiForTag(m.tag)}</span>
              <div className="body">
                <div className="head">
                  {m.tag}{m.players.length > 0 ? ` — ${m.players.map(shortOf).join(' & ')}` : ''}
                </div>
                <div className="meta">Hole {m.hole}</div>
                {m.note && <div className="note">{story ? m.note : `“${m.note}”`}</div>}
              </div>
              <button className="del" aria-label="Delete moment" onClick={() => onDelete(m.id)}>✕</button>
            </div>
          )
        })
      )}
    </div>
  )
}

function ScoreRow({
  game, player, hole, par, value, onSet, onShowCard,
}: {
  game: Game; player: GamePlayer; hole: number; par: number; value: number | undefined; onSet: (s: number | null) => void; onShowCard: () => void
}) {
  const base = [par - 2, par - 1, par, par + 1, par + 2, par + 3].filter((v) => v >= 1)
  const overflow = typeof value === 'number' && value > par + 3 ? value : null
  const strokes = holeStrokes(game, player.id, hole)
  const holes = courseOf(game).holes

  // running net vs par
  let gross = 0, n = 0, net = 0
  for (let h = 1; h <= 18; h++) {
    const s = game.scores[h]?.[player.id]
    if (typeof s === 'number') {
      gross += s; n++
      net += s - holeStrokes(game, player.id, h) - holes[h - 1].par
    }
  }

  return (
    <div className="score-card">
      <div className="prow">
        <button type="button" className="pname-btn" onClick={onShowCard} title={`See ${player.name.split(' ')[0]}'s card`}>
          <span className="pname">{player.name}</span>
          <span className="pname-card" aria-hidden="true">🗂</span>
          {strokes > 0 && (
            <span className="pstroke">{'●'.repeat(strokes)} {strokes} stroke{strokes > 1 ? 's' : ''} here</span>
          )}
        </button>
        <span className="ptotal">
          {n > 0 ? `${gross} gross · net ${net === 0 ? 'E' : net > 0 ? '+' + net : net} · ${n}h` : '—'}
        </span>
      </div>
      <div className="chips">
        {base.map((v) => (
          <button
            key={v}
            className={`chip ${value === v ? 'selected' : ''} ${v === par ? 'par-chip' : ''}`}
            onClick={() => onSet(value === v ? null : v)}
          >
            <span className="n">{v}</span>
            <span className="lbl">{REL[v - par] ?? `+${v - par}`}</span>
          </button>
        ))}
        <button className={`chip ${overflow ? 'selected' : ''}`} onClick={() => onSet(overflow ? overflow + 1 : par + 4)}>
          <span className="n">{overflow ?? `${par + 4}+`}</span>
          <span className="lbl">{overflow ? 'tap +1' : 'Ouch'}</span>
        </button>
      </div>
    </div>
  )
}

function SaveSection({ game, onFinish }: {
  game: Game
  onFinish: () => Promise<{ roundId: number } | { error: string }>
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [err, setErr] = useState('')
  const money = effectiveMoney(game)
  const tracksMoney = useTracksMoney()
  const showMoney =
    tracksMoney &&
    (game.scoringMode === 'total' || game.format === 'autopress' || game.format === 'both')

  const save = async () => {
    setStatus('saving')
    const r = await onFinish()
    if ('roundId' in r) {
      setStatus('saved')
      router.push('/')    // back to the home screen
    } else { setStatus('error'); setErr(r.error) }
  }

  return (
    <div className="save-card">
      <div className="setup-label">Round complete</div>
      {showMoney && (
        <div className="settle-list">
          {[...game.players].sort((a, b) => money[b.id] - money[a.id]).map((p) => (
            <div className="settle-row" key={p.id}>
              <span>{p.name}</span>
              <span className={money[p.id] > 0 ? 'up-a' : money[p.id] < 0 ? 'up-b' : 'as'}>
                {money[p.id] === 0 ? '—' : `${money[p.id] > 0 ? '+' : '−'}₹${Math.abs(money[p.id]).toLocaleString('en-IN')}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {status === 'saved' ? (
        <div className="saved-msg">✓ Saved — handicaps{tracksMoney ? ' & money' : ''} updated</div>
      ) : (
        <button className="cta" disabled={status === 'saving'} onClick={save}>
          {status === 'saving' ? 'Saving…' : 'Save Round'}
        </button>
      )}
      {status === 'error' && <div className="err-msg">⚠ {err}</div>}
    </div>
  )
}

/* The single "I'm stopping now" surface: record (saving pro-rates a partial
   card to 18 for handicaps) or discard. Both act for the whole fourball —
   everyone's phone follows within a poll. */
function EndRoundSheet({ game, onFinish, onDiscard, onClose }: {
  game: Game
  onFinish: () => Promise<{ roundId: number } | { error: string }>
  onDiscard: () => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [err, setErr] = useState('')

  // how many holes carry at least one score, and whether the whole field is in
  const scored = roundHolesPlayed(game.scores)
  let complete = true
  for (let h = 1; h <= 18; h++) {
    if (!game.players.every((p) => typeof game.scores[h]?.[p.id] === 'number')) complete = false
  }
  // Under the house minimum nothing is recorded, so there is nothing to save.
  const tooShort = scored < MIN_HOLES_TO_RECORD
  const short = MIN_HOLES_TO_RECORD - scored

  const save = async () => {
    setStatus('saving')
    const r = await onFinish()
    if ('roundId' in r) router.push('/')
    else { setStatus('error'); setErr(r.error) }
  }

  const discard = async () => {
    if (!confirm('Discard this round for everyone in the fourball?')) return
    const r = await onDiscard()
    if (r.ok) onClose()
    else { setStatus('error'); setErr(r.error ?? 'Discard failed') }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h2>End the round?</h2>
        {tooShort ? (
          <div className="end-note warn">
            ⚠ Only <b>{scored} of 18</b> holes scored. Rounds need at least{' '}
            <b>{MIN_HOLES_TO_RECORD} holes</b> to count, so ending now records{' '}
            <b>nothing</b> — no scores and no winnings, for anyone in the fourball.
            {' '}Play {short} more hole{short > 1 ? 's' : ''} to have this round count.
          </div>
        ) : (
          <div className="end-note">
            {complete
              ? 'All 18 holes are in.'
              : `${scored} of 18 holes scored. Recording will pro-rate each card to 18 holes for handicaps (the strokes over par are scaled up).`}
            {' '}This ends the round for the whole fourball.
          </div>
        )}
        {!tooShort && (
          <button className="primary" disabled={status === 'saving'} onClick={save}>
            {status === 'saving' ? 'Saving…' : complete ? 'Save & record' : 'Save & record (pro-rated)'}
          </button>
        )}
        <button className={tooShort ? 'primary' : 'flat'} onClick={onClose}>Keep playing</button>
        <button className="danger" onClick={discard}>
          {tooShort ? 'Discard round (nothing will be saved)' : 'Discard round (for everyone)'}
        </button>
        {status === 'error' && <div className="err-msg">⚠ {err}</div>}
      </div>
    </div>
  )
}

/* ───────────────────────── Total-only entry ───────────────────────── */

function TotalEntry({ game, mutate, onFinish, onDiscard }: {
  game: Game
  mutate: (op: LiveOp) => void
  onFinish: () => Promise<{ roundId: number } | { error: string }>
  onDiscard: () => Promise<{ ok: boolean; error?: string }>
}) {
  const tracksMoney = useTracksMoney()
  // a player's total lives under a synthetic hole 0
  const setTotal = (pid: PlayerId, v: number | null) =>
    mutate({ op: 'score', hole: 0, playerId: pid, strokes: v })

  const setMoney = (pid: PlayerId, v: number | null) =>
    mutate({ op: 'money', playerId: pid, amount: v })

  const allIn = game.players.every((p) => typeof game.scores[0]?.[p.id] === 'number')
  // rank by net (lowest first), only meaningful once any total is in
  const ranked = [...game.players]
    .map((p) => ({ p, total: game.scores[0]?.[p.id], net: typeof game.scores[0]?.[p.id] === 'number' ? (game.scores[0]![p.id] as number) - p.strokes : null }))
    .sort((a, b) => (a.net ?? 999) - (b.net ?? 999))

  const balance = game.players.reduce((acc, p) => acc + (game.money?.[p.id] ?? 0), 0)

  return (
    <div>
      <div className="setup-label" style={{ marginTop: 10 }}>
        {tracksMoney ? 'Final score & winnings' : 'Final score'}
      </div>
      <div className="total-hint">
        {tracksMoney
          ? 'Enter each player’s gross total and their winnings (₹). No match play or Auto Press — this just updates handicaps and money.'
          : 'Enter each player’s gross total. No match play or Auto Press — this just updates handicaps.'}
      </div>
      {ranked.map(({ p, total, net }, i) => (
        <div className="score-card" key={p.id}>
          <div className="prow">
            <div>
              {net !== null && <span className="rank-pip">{i + 1}</span>}
              <span className="pname">{p.name}</span>
              {p.strokes > 0 && <span className="pstroke">{p.strokes} strokes</span>}
            </div>
            <span className="ptotal">{net !== null ? `net ${net}` : '—'}</span>
          </div>
          <div className="total-inputs">
            <label className="total-field">
              <span>Gross</span>
              <input
                className="total-input"
                inputMode="numeric"
                placeholder="score"
                value={total ?? ''}
                onChange={(e) => setTotal(p.id, e.target.value ? Number(e.target.value) : null)}
              />
            </label>
            {tracksMoney && <label className="total-field">
              <span>Winnings ₹</span>
              <div className="money-input-row">
                <button
                  type="button"
                  className={`sign-toggle ${(game.money?.[p.id] ?? 0) < 0 ? 'neg' : 'pos'}`}
                  aria-label="Toggle won / lost"
                  onClick={() => {
                    const cur = game.money?.[p.id]
                    if (cur == null || cur === 0) return
                    setMoney(p.id, -cur)
                  }}
                >
                  {(game.money?.[p.id] ?? 0) < 0 ? '−' : '+'}
                </button>
                <input
                  className="total-input"
                  inputMode="numeric"
                  placeholder="₹"
                  value={game.money?.[p.id] != null ? Math.abs(game.money[p.id]!) : ''}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '')
                    if (digits === '') {
                      setMoney(p.id, null)
                      return
                    }
                    const neg = (game.money?.[p.id] ?? 0) < 0
                    const n = Number(digits)
                    setMoney(p.id, neg ? -n : n)
                  }}
                />
              </div>
            </label>}
          </div>
        </div>
      ))}

      {tracksMoney && (
        <div className={`pot-balance ${balance === 0 ? 'level' : 'off'}`}>
          Pot balance: {balance === 0 ? 'level ✓' : `${balance > 0 ? '+' : '−'}₹${Math.abs(balance).toLocaleString('en-IN')} — winnings don't net to zero (you can still save)`}
        </div>
      )}

      {allIn ? (
        <>
          <SaveSection game={game} onFinish={onFinish} />
          <button className="cta ghost" style={{ marginTop: 10 }} onClick={() => { if (confirm('End this round for everyone and clear it?')) onDiscard() }}>End Round</button>
        </>
      ) : (
        <button className="cta ghost" style={{ marginTop: 12 }} onClick={() => { if (confirm('End this round for everyone and clear it?')) onDiscard() }}>End Round</button>
      )}
    </div>
  )
}
