'use client'
import { courseOf, holeStrokes, playerLine } from '@/lib/golf/game'
import type { Game, GamePlayer } from '@/lib/golf/game'
import type { Hole } from '@/lib/golf/course'

/* One player's colour-coded card, popped over the Play screen — tap a name to open.
   Mirrors the group Scorecard's colouring but for a single player, and marks the
   holes where they get handicap strokes. */

const relClass = (rel: number) =>
  rel <= -2 ? 'sc-eagle' : rel === -1 ? 'sc-birdie' : rel === 0 ? 'sc-par' : rel === 1 ? 'sc-bogey' : 'sc-dbl'

const fmtVsPar = (v: number) => (v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`)

function Nine({ game, player, holes, label }: {
  game: Game; player: GamePlayer; holes: Hole[]; label: 'OUT' | 'IN'
}) {
  const par = holes.reduce((a, h) => a + h.par, 0)
  let gross = 0, any = false
  for (const h of holes) {
    const s = game.scores[h.n]?.[player.id]
    if (typeof s === 'number') { gross += s; any = true }
  }
  return (
    <table className="sc-table">
      <thead>
        <tr>
          <th className="sc-name">{label === 'OUT' ? 'Front' : 'Back'}</th>
          {holes.map((h) => <th key={h.n}>{h.n}</th>)}
          <th className="sc-sub">{label}</th>
        </tr>
        <tr className="sc-par-row">
          <th className="sc-name">Par</th>
          {holes.map((h) => <td key={h.n}>{h.par}</td>)}
          <td className="sc-sub">{par}</td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th className="sc-name">{player.name.split(' ')[0]}</th>
          {holes.map((h) => {
            const s = game.scores[h.n]?.[player.id]
            const cls = typeof s === 'number' ? relClass(s - h.par) : ''
            const str = holeStrokes(game, player.id, h.n)
            return (
              <td key={h.n} className={`sc-cell ${cls}`}>
                {typeof s === 'number' ? <span className="sc-val">{s}</span> : ''}
                {str > 0 && <i className="sc-stroke" aria-hidden="true">{str > 1 ? str : '•'}</i>}
              </td>
            )
          })}
          <td className="sc-sub">{any ? gross : '–'}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function PlayerCardSheet({ game, player, onClose }: {
  game: Game; player: GamePlayer; onClose: () => void
}) {
  const holes = courseOf(game).holes
  const line = playerLine(game, player.id)
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <div className="pcard-head">
          <h2 style={{ margin: 0 }}>{player.name}</h2>
          <div className="pcard-tot">
            {line.holes > 0 ? (
              <>
                <span className="g">{line.gross}</span>
                <span className="vp">{fmtVsPar(line.vsPar)}</span>
                {line.strokes > 0 && <span className="net">net {fmtVsPar(line.netVsPar)}</span>}
                <span className="thru">{line.holes < 18 ? `thru ${line.holes}` : ''}</span>
              </>
            ) : <span className="vp">—</span>}
          </div>
        </div>
        <Nine game={game} player={player} holes={holes.slice(0, 9)} label="OUT" />
        <Nine game={game} player={player} holes={holes.slice(9, 18)} label="IN" />
        <div className="sc-legend">
          <span><i className="sc-key sc-eagle" />Eagle−</span>
          <span><i className="sc-key sc-birdie" />Birdie</span>
          <span><i className="sc-key sc-bogey" />Bogey</span>
          <span><i className="sc-key sc-dbl" />Dbl+</span>
          <span><i className="sc-stroke" aria-hidden="true">•</i>Stroke</span>
        </div>
        <button className="flat" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
