'use client'
import { useEffect, useState } from 'react'
import './play.css'
import {
  COURSE, loadGame, saveGame, liveMatches, liveAutoPress, holeStrokes, playerName,
} from '@/lib/golf/game'
import type { Game, GamePlayer } from '@/lib/golf/game'
import { fieldStrokes } from '@/lib/golf/strokes'
import type { Format, PlayerId, ScoringMode } from '@/lib/golf/types'

type RosterPlayer = { id: number; name: string; handicap: number }

export default function PlayPage() {
  const [game, setGame] = useState<Game | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setGame(loadGame())
    setLoaded(true)
  }, [])

  const update = (g: Game | null) => {
    setGame(g)
    saveGame(g)
  }

  if (!loaded) return <div className="play" />

  return (
    <div className="play">
      <header className="play-head">
        <div className="crest">⛳ Delhi Golf Club ⛳</div>
        <h1 className="serif">The Round</h1>
        <div className="sub">{COURSE.short} · {COURSE.tees}</div>
      </header>
      {game ? <Scoring game={game} onChange={update} /> : <Setup onStart={update} />}
    </div>
  )
}

/* ───────────────────────── Setup ───────────────────────── */

function Setup({ onStart }: { onStart: (g: Game) => void }) {
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [count, setCount] = useState<2 | 4 | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [mode, setMode] = useState<ScoringMode | null>(null)
  const [format, setFormat] = useState<Format | null>(null)
  const [teamA, setTeamA] = useState<number[]>([])

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
    const strokes = fieldStrokes(chosen, 75)
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
      format: needFormat ? format! : 'match',
      teamA: a, teamB: b, singles,
      scores: {},
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
          <div className="setup-label">Who's playing · pick {count} ({picked.length}/{count})</div>
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
          <div className="team-col"><div className="slot filled">{COURSE.name} · {COURSE.tees}</div></div>
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

/* ───────────────────────── Scoring ───────────────────────── */

const REL: Record<number, string> = { [-2]: 'Eagle', [-1]: 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Dbl', 3: '+3' }

function Scoring({ game, onChange }: { game: Game; onChange: (g: Game | null) => void }) {
  const firstIncomplete = () => {
    for (let h = 1; h <= 18; h++) {
      if (!game.players.every((p) => typeof game.scores[h]?.[p.id] === 'number')) return h
    }
    return 18
  }
  const [hole, setHole] = useState(firstIncomplete)

  if (game.scoringMode === 'total') return <TotalEntry game={game} onChange={onChange} />

  const info = COURSE.holes[hole - 1]

  const setScore = (pid: PlayerId, score: number | null) => {
    const scores = { ...game.scores, [hole]: { ...game.scores[hole] } }
    if (score === null) delete scores[hole][pid]
    else scores[hole][pid] = score
    const next = { ...game, scores }
    onChange(next)
    const allIn = game.players.every((p) => typeof scores[hole]?.[p.id] === 'number')
    if (allIn && score !== null && hole < 18) setTimeout(() => setHole((h) => Math.min(18, h + 1)), 700)
  }

  return (
    <div>
      <div className="hole-head">
        <span className="course-chip">{COURSE.short}</span>
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

      {game.players.map((p) => (
        <ScoreRow
          key={p.id}
          game={game}
          player={p}
          hole={hole}
          par={info.par}
          value={game.scores[hole]?.[p.id]}
          onSet={(s) => setScore(p.id, s)}
        />
      ))}

      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        <button className="cta ghost" style={{ flex: 1 }} onClick={() => { if (confirm('End this round and clear it?')) onChange(null) }}>
          End Round
        </button>
      </div>

      <MatchBar game={game} />
    </div>
  )
}

function ScoreRow({
  game, player, hole, par, value, onSet,
}: {
  game: Game; player: GamePlayer; hole: number; par: number; value: number | undefined; onSet: (s: number | null) => void
}) {
  const base = [par - 2, par - 1, par, par + 1, par + 2, par + 3].filter((v) => v >= 1)
  const overflow = typeof value === 'number' && value > par + 3 ? value : null
  const strokes = holeStrokes(game, player.id, hole)

  // running net vs par
  let gross = 0, n = 0, net = 0
  for (let h = 1; h <= 18; h++) {
    const s = game.scores[h]?.[player.id]
    if (typeof s === 'number') {
      gross += s; n++
      net += s - holeStrokes(game, player.id, h) - COURSE.holes[h - 1].par
    }
  }

  return (
    <div className="score-card">
      <div className="prow">
        <div>
          <span className="pname">{player.name}</span>
          {strokes > 0 && <span className="pstroke">{'•'.repeat(strokes)} stroke{strokes > 1 ? 's' : ''}</span>}
        </div>
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

function MatchBar({ game }: { game: Game }) {
  const showMatch = game.format === 'match' || game.format === 'both'
  const showAp = game.format === 'autopress' || game.format === 'both'
  const matches = showMatch ? liveMatches(game) : []
  const ap = showAp ? liveAutoPress(game) : null

  return (
    <div className="match-bar">
      {matches.map((m, i) => {
        const s = m.state
        const cls = s.thru === 0 || s.diff === 0 ? 'as' : s.diff > 0 ? 'up-a' : 'up-b'
        const lead = s.diff > 0 ? m.a : m.b
        const status = s.thru === 0
          ? '—'
          : s.decided
            ? (s.winner === 'half' ? 'HALVED' : `${shortSide(game, lead)} ${s.resultText}`)
            : (s.diff === 0 ? `${s.statusText} · ${s.thru}` : `${shortSide(game, lead)} ${s.statusText} · ${s.thru}`)
        return (
          <div className="mline" key={i}>
            <span className="mkind">{m.kind === 'fourball' ? '4-Ball' : 'Singles'}</span>
            <span className="mwho">{m.label}</span>
            <span className={`mstat ${cls}`}>{status}</span>
          </div>
        )
      })}
      {ap && (
        <div className={`mline ${matches.length ? 'ap-line' : ''}`}>
          <span className="mkind">Auto Press</span>
          <span className="mwho">{ap.thru === 0 ? 'starts at hole 1' : ap.leader ? `${shortSide(game, ap.leader)} +${Math.abs(ap.margin)}` : 'all square'}</span>
          <span className="ap-string">{ap.string}</span>
        </div>
      )}
    </div>
  )
}

const shortSide = (game: Game, side: PlayerId[]) =>
  side.map((id) => playerName(game, id).split(' ')[0]).join('&')

/* ───────────────────────── Total-only entry ───────────────────────── */

function TotalEntry({ game, onChange }: { game: Game; onChange: (g: Game | null) => void }) {
  const setTotal = (pid: PlayerId, v: number | null) => {
    // store a player's total under a synthetic hole 0
    const scores = { ...game.scores, 0: { ...game.scores[0] } }
    if (v === null) delete scores[0][pid]
    else scores[0][pid] = v
    onChange({ ...game, scores })
  }
  return (
    <div>
      <div className="setup-label" style={{ marginTop: 10 }}>Total gross score</div>
      {game.players.map((p) => {
        const total = game.scores[0]?.[p.id]
        const net = typeof total === 'number' ? total - p.strokes : null
        return (
          <div className="score-card" key={p.id}>
            <div className="prow">
              <div><span className="pname">{p.name}</span><span className="pstroke">{p.strokes} strokes</span></div>
              <span className="ptotal">{net !== null ? `net ${net}` : '—'}</span>
            </div>
            <input
              className="cta ghost"
              style={{ textAlign: 'center', fontSize: 22 }}
              inputMode="numeric"
              placeholder="gross"
              value={total ?? ''}
              onChange={(e) => setTotal(p.id, e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        )
      })}
      <button className="cta ghost" style={{ marginTop: 12 }} onClick={() => { if (confirm('End this round and clear it?')) onChange(null) }}>End Round</button>
    </div>
  )
}
